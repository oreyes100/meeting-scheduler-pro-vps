import { createClient } from '@supabase/supabase-js';

/**
 * Executes the auto-assignment logic for a specific meeting ID.
 * Connects to Supabase using either a custom client or creates a service-role client.
 * 
 * @param {string} meetingId 
 * @param {any} [customClient] 
 * @returns {Promise<{ assignedCount: number, totalCount: number, logs: string[] }>}
 */
export async function runAutoAssignment(meetingId, customClient = null) {
  const supabase = customClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const logs = [];
  logs.push(`🤖 Starting auto-assignment for meeting: ${meetingId}`);

  // 1. Fetch the meeting details
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    throw new Error(`Failed to fetch meeting: ${meetingError?.message || 'Meeting not found'}`);
  }

  if (meeting.assembly_type) {
    logs.push(`ℹ️ Skipping auto-assignment — this week is ${meeting.assembly_type === 'regional' ? 'Asamblea Regional' : 'Asamblea de Circuito'}`);
    return { assignedCount: 0, totalCount: 0, logs };
  }

  // 2. Fetch meeting parts for this meeting
  const { data: parts, error: partsError } = await supabase
    .from('meeting_parts')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('part_number', { ascending: true });

  if (partsError) {
    throw new Error(`Failed to fetch meeting parts: ${partsError.message}`);
  }

  if (!parts || parts.length === 0) {
    logs.push('⚠️ No parts found for this meeting.');
    return { assignedCount: 0, totalCount: 0, logs };
  }

  // 3. Fetch all active publishers
  let users = [];
  const { data: activeUsers, error: usersError } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true);

  if (usersError) {
    // Fallback in case is_active column doesn't exist yet
    const { data: usersFallback, error: fallbackError } = await supabase
      .from('users')
      .select('*');
    if (fallbackError) throw new Error(`Failed to fetch users: ${fallbackError.message}`);
    users = usersFallback || [];
  } else {
    users = activeUsers || [];
  }

  logs.push(`👥 Loaded ${users.length} active publishers for scheduling.`);

  // 4. Gather assignment history per ROLE so the same person is not picked for
  //    the same assignment two weeks in a row.
  //    historyByRole: "user_id:part_type" -> date string of the last time that
  //    user filled that exact role. Falls back to alphabetical order if no
  //    candidate has any history for the role.
  const historyByRole = {}; // "user_id:part_type" -> ISO date of last assignment
  const bumpHistory = (userId, partType, date) => {
    if (!userId || !partType || !date) return;
    const key = `${userId}:${partType}`;
    const prev = historyByRole[key];
    if (!prev || new Date(date) > new Date(prev)) {
      historyByRole[key] = date;
    }
  };

  // 4a. Pull every past meeting_part with its part_type so we know which role
  //     each assignee last filled. (The previous version omitted part_type and
  //     collapsed all roles into a single per-user date, which caused the same
  //     person to keep landing on the same slot every week.)
  const { data: pastParts, error: historyError } = await supabase
    .from('meeting_parts')
    .select(`
      assigned_user_id,
      assistant_user_id,
      part_type,
      meetings ( date )
    `)
    .not('assigned_user_id', 'is', null);

  if (!historyError && pastParts) {
    pastParts.forEach(p => {
      const meetingDate = p.meetings?.date;
      if (!meetingDate) return;
      if (p.part_type) {
        bumpHistory(p.assigned_user_id, p.part_type, meetingDate);
      }
      // Assistants are logged under their own role key so they don't get
      // pinned back-to-back as assistant on consecutive weeks.
      if (p.assistant_user_id) {
        bumpHistory(p.assistant_user_id, 'assistant', meetingDate);
      }
    });
  }

  // 4b. Also pull part_history which holds meeting-level roles
  //     (chairman, opening_prayer, closing_prayer, cbs_conducer, cbs_reader).
  const { data: customHistory } = await supabase
    .from('part_history')
    .select('user_id, part_type, assigned_date');
  if (customHistory) {
    customHistory.forEach(h => {
      bumpHistory(h.user_id, h.part_type, h.assigned_date);
    });
  }

  // Helper: sort candidates Least-Recently-Assigned for a SPECIFIC role.
  // Users who never did this role come first, then oldest-dated users, with
  // alphabetical name as a stable tie-breaker.
  const getLRASortedUsers = (filteredUsers, partType) => {
    return [...filteredUsers].sort((a, b) => {
      const dateA = partType ? historyByRole[`${a.id}:${partType}`] : null;
      const dateB = partType ? historyByRole[`${b.id}:${partType}`] : null;
      const nameA = a.name || a.display_name || '';
      const nameB = b.name || b.display_name || '';
      if (!dateA && !dateB) return nameA.localeCompare(nameB);
      if (!dateA) return -1; // never did this role → first
      if (!dateB) return 1;
      const diff = new Date(dateA).getTime() - new Date(dateB).getTime();
      if (diff !== 0) return diff; // oldest (least recent) first
      return nameA.localeCompare(nameB);
    });
  };

  // Set of user IDs assigned in THIS meeting to avoid double-booking
  const assignedInThisMeeting = new Set();
  
  // Pre-fill already manually assigned users
  if (meeting.chairman_id) assignedInThisMeeting.add(meeting.chairman_id);
  if (meeting.opening_prayer_id) assignedInThisMeeting.add(meeting.opening_prayer_id);
  if (meeting.closing_prayer_id) assignedInThisMeeting.add(meeting.closing_prayer_id);
  if (meeting.cbs_conductor_id) assignedInThisMeeting.add(meeting.cbs_conductor_id);
  if (meeting.cbs_reader_id) assignedInThisMeeting.add(meeting.cbs_reader_id);

  parts.forEach(p => {
    if (p.assigned_user_id) assignedInThisMeeting.add(p.assigned_user_id);
    if (p.assistant_user_id) assignedInThisMeeting.add(p.assistant_user_id);
  });

  // --- Assign Meeting-Level Roles first (Chairman, CBS, Prayers) ---
  // The 4th arg is the part_type key used to look up per-role LRA history.
  // If `mirrorAs` is provided, the same user is also written to that other
  // meeting-level field and logged under both role keys. Used to tie the
  // opening prayer to the chairman (per user spec: opening prayer is ALWAYS
  // the chairman).
  const assignMeetingRole = async (field, roleName, partType, filterFn, mirrorAs) => {
    if (!meeting[field]) {
      const candidates = users.filter(u => !assignedInThisMeeting.has(u.id) && filterFn(u));
      const sorted = getLRASortedUsers(candidates, partType);
      if (sorted.length > 0) {
        const chosen = sorted[0];
        const updateObj = {};
        updateObj[field] = chosen.id;
        if (mirrorAs) updateObj[mirrorAs.field] = chosen.id;

        const { error } = await supabase
          .from('meetings')
          .update(updateObj)
          .eq('id', meetingId);

        if (!error) {
          meeting[field] = chosen.id;
          assignedInThisMeeting.add(chosen.id);
          if (mirrorAs) {
            meeting[mirrorAs.field] = chosen.id;
            logs.push(`✅ Assigned ${chosen.name} as ${roleName} (and ${mirrorAs.label})`);
          } else {
            logs.push(`✅ Assigned ${chosen.name} as ${roleName}`);
          }

          // Log in part_history (use the explicit partType so the per-role
          // history lookup on the next run is consistent)
          await supabase.from('part_history').insert({
            meeting_id: meetingId,
            user_id: chosen.id,
            role: partType,
            part_type: partType,
            assigned_date: meeting.date
          });
          if (mirrorAs) {
            await supabase.from('part_history').insert({
              meeting_id: meetingId,
              user_id: chosen.id,
              role: mirrorAs.partType,
              part_type: mirrorAs.partType,
              assigned_date: meeting.date
            });
          }
        } else {
          logs.push(`❌ Error assigning ${chosen.name} as ${roleName}: ${error.message}`);
        }
      } else {
        logs.push(`⚠️ No available candidate for ${roleName}`);
      }
    } else {
      logs.push(`ℹ️ ${roleName} already assigned.`);
    }
  };

  // Chairman (Male, can_be_chairman). The opening prayer is ALWAYS the
  // chairman per the user spec, so we mirror the assignment through the
  // 5th arg.
  await assignMeetingRole(
    'chairman_id', 'Chairman', 'chairman',
    u => u.gender === 'male' && u.can_be_chairman,
    { field: 'opening_prayer_id', partType: 'opening_prayer', label: 'Opening Prayer' }
  );

  // CBS Conducer (Male, can_be_cbs_conductor)
  await assignMeetingRole('cbs_conductor_id', 'CBS Conducer', 'cbs_conductor', u => u.gender === 'male' && u.can_be_cbs_conductor);

  // CBS Reader (Male, can_be_cbs_reader)
  await assignMeetingRole('cbs_reader_id', 'CBS Reader', 'cbs_reader', u => u.gender === 'male' && u.can_be_cbs_reader);

  // Closing Prayer (Male, can_do_prayers)
  await assignMeetingRole('closing_prayer_id', 'Closing Prayer', 'closing_prayer', u => u.gender === 'male' && u.can_do_prayers);

  // Sync CBS conductor to the cbs meeting_part so the assigned count is accurate.
  // The UI reads conductor/reader from meeting-level fields; this write keeps
  // meeting_parts.assigned_user_id consistent with that assignment.
  if (meeting.cbs_conductor_id) {
    const cbsPart = parts.find(p => p.part_type === 'cbs');
    if (cbsPart && !cbsPart.assigned_user_id) {
      await supabase
        .from('meeting_parts')
        .update({ assigned_user_id: meeting.cbs_conductor_id })
        .eq('id', cbsPart.id);
      cbsPart.assigned_user_id = meeting.cbs_conductor_id;
    }
  }

  // --- Assign Part-Level Roles (Treasures talk, Gems, Bible Reading, Student Parts, Living) ---
  let newlyAssignedCount = 0;

  for (const part of parts) {
    // 1. Treasures Talk (Male, can_be_speaker)
    if (part.part_type === 'treasures_talk' && !part.assigned_user_id) {
      const candidates = users.filter(u => !assignedInThisMeeting.has(u.id) && u.gender === 'male' && u.can_be_speaker);
      const sorted = getLRASortedUsers(candidates, 'treasures_talk');
      if (sorted.length > 0) {
        const chosen = sorted[0];
        const { error } = await supabase
          .from('meeting_parts')
          .update({ assigned_user_id: chosen.id })
          .eq('id', part.id);
        
        if (!error) {
          assignedInThisMeeting.add(chosen.id);
          part.assigned_user_id = chosen.id;
          newlyAssignedCount++;
          logs.push(`✅ Assigned ${chosen.name} to Treasures Talk: "${part.title}"`);
          
          await supabase.from('part_history').insert({
            meeting_id: meetingId,
            user_id: chosen.id,
            role: 'treasures_talk',
            part_type: 'treasures_talk',
            assigned_date: meeting.date
          });
        }
      } else {
        logs.push(`⚠️ No candidate found for Treasures Talk: "${part.title}"`);
      }
    }

    // 2. Spiritual Gems (Male, can_do_gems)
    if (part.part_type === 'spiritual_gems' && !part.assigned_user_id) {
      const candidates = users.filter(u => !assignedInThisMeeting.has(u.id) && u.gender === 'male' && u.can_do_gems);
      const sorted = getLRASortedUsers(candidates, 'spiritual_gems');
      if (sorted.length > 0) {
        const chosen = sorted[0];
        const { error } = await supabase
          .from('meeting_parts')
          .update({ assigned_user_id: chosen.id })
          .eq('id', part.id);
        
        if (!error) {
          assignedInThisMeeting.add(chosen.id);
          part.assigned_user_id = chosen.id;
          newlyAssignedCount++;
          logs.push(`✅ Assigned ${chosen.name} to Spiritual Gems`);
          
          await supabase.from('part_history').insert({
            meeting_id: meetingId,
            user_id: chosen.id,
            role: 'spiritual_gems',
            part_type: 'spiritual_gems',
            assigned_date: meeting.date
          });
        }
      } else {
        logs.push(`⚠️ No candidate found for Spiritual Gems`);
      }
    }

    // 3. Bible Reading (brothers only — women are excluded per congregation policy)
    if (part.part_type === 'bible_reading' && !part.assigned_user_id) {
      const candidates = users.filter(u => !assignedInThisMeeting.has(u.id) && u.can_do_bible_reading && u.gender === 'male');
      const sorted = getLRASortedUsers(candidates, 'bible_reading');
      if (sorted.length > 0) {
        const chosen = sorted[0];
        const { error } = await supabase
          .from('meeting_parts')
          .update({ assigned_user_id: chosen.id })
          .eq('id', part.id);
        
        if (!error) {
          assignedInThisMeeting.add(chosen.id);
          part.assigned_user_id = chosen.id;
          newlyAssignedCount++;
          logs.push(`✅ Assigned ${chosen.name} to Bible Reading (${part.class_type.toUpperCase()})`);
          
          await supabase.from('part_history').insert({
            meeting_id: meetingId,
            user_id: chosen.id,
            role: 'bible_reading',
            part_type: 'bible_reading',
            assigned_date: meeting.date
          });
        }
      } else {
        logs.push(`⚠️ No candidate found for Bible Reading (${part.class_type.toUpperCase()})`);
      }
    }

    // 4. Student Parts (Apply Yourself to the Field Ministry)
    if (part.part_type === 'student_part' && !part.assigned_user_id) {
      const isTalk = part.student_part_type === 'talk';
      const candidates = users.filter(u => !assignedInThisMeeting.has(u.id) && u.can_do_student_parts && (!isTalk || u.gender === 'male'));
      const sorted = getLRASortedUsers(candidates, 'student_part');
      if (sorted.length > 0) {
        const student = sorted[0];

        // Find assistant if needed
        let assistantId = part.assistant_user_id || null;
        if (!assistantId && part.student_part_type !== 'talk') {
          // Rule: assistant must have same gender as student
          const assistantCandidates = users.filter(
            u => !assignedInThisMeeting.has(u.id) &&
                 u.id !== student.id &&
                 u.gender === student.gender &&
                 u.can_be_assistant
          );
          const sortedAssistants = getLRASortedUsers(assistantCandidates, 'assistant');
          if (sortedAssistants.length > 0) {
            assistantId = sortedAssistants[0].id;
          }
        }

        const { error } = await supabase
          .from('meeting_parts')
          .update({ 
            assigned_user_id: student.id,
            assistant_user_id: assistantId
          })
          .eq('id', part.id);
        
        if (!error) {
          assignedInThisMeeting.add(student.id);
          part.assigned_user_id = student.id;
          
          let assistantMsg = '';
          if (assistantId) {
            assignedInThisMeeting.add(assistantId);
            part.assistant_user_id = assistantId;
            const assistantName = users.find(u => u.id === assistantId)?.name;
            assistantMsg = ` with assistant ${assistantName}`;
            
            await supabase.from('part_history').insert({
              meeting_id: meetingId,
              user_id: assistantId,
              role: 'assistant',
              part_type: 'assistant',
              assigned_date: meeting.date
            });
          }

          newlyAssignedCount++;
          logs.push(`✅ Assigned ${student.name}${assistantMsg} to Student Part: "${part.title}" (${part.class_type.toUpperCase()})`);
          
          await supabase.from('part_history').insert({
            meeting_id: meetingId,
            user_id: student.id,
            role: 'student_part',
            part_type: 'student_part',
            assigned_date: meeting.date
          });
        }
      } else {
        logs.push(`⚠️ No candidate found for Student Part: "${part.title}"`);
      }
    }

    // 5. Living as Christians Parts (Male, can_be_speaker OR can_be_chairman)
    //    Living parts ("Nuestra vida cristiana") are given by any qualified
    //    brother. If the can_be_speaker pool is exhausted by chairman,
    //    prayers, and treasures talk, fall back to brothers eligible to
    //    preside — they are typically the same elders/MS pool.
    if (part.part_type === 'living_part' && !part.assigned_user_id) {
      const candidates = users.filter(u =>
        !assignedInThisMeeting.has(u.id) &&
        u.gender === 'male' &&
        (u.can_be_speaker || u.can_be_chairman)
      );
      const sorted = getLRASortedUsers(candidates, 'living_part');
      if (sorted.length > 0) {
        const chosen = sorted[0];
        const { error } = await supabase
          .from('meeting_parts')
          .update({ assigned_user_id: chosen.id })
          .eq('id', part.id);
        
        if (!error) {
          assignedInThisMeeting.add(chosen.id);
          part.assigned_user_id = chosen.id;
          newlyAssignedCount++;
          logs.push(`✅ Assigned ${chosen.name} to Living Part: "${part.title}"`);
          
          await supabase.from('part_history').insert({
            meeting_id: meetingId,
            user_id: chosen.id,
            role: 'living_part',
            part_type: 'living_part',
            assigned_date: meeting.date
          });
        }
      } else {
        logs.push(`⚠️ No candidate found for Living Part: "${part.title}"`);
      }
    }
  }

  // --- Auto-assign cleaning_group (sequential 1→2→3→4→1) ---
  if (!meeting.cleaning_group) {
    const { data: prevMeetings } = await supabase
      .from('meetings')
      .select('cleaning_group, date')
      .lt('date', meeting.date)
      .not('cleaning_group', 'is', null)
      .order('date', { ascending: false })
      .limit(1);

    const lastGroup = prevMeetings?.[0]?.cleaning_group;
    const lastNum = parseInt(lastGroup) || 0;
    const nextGroup = String((lastNum % 4) + 1);

    const { error: cleanErr } = await supabase
      .from('meetings')
      .update({ cleaning_group: nextGroup })
      .eq('id', meetingId);

    if (!cleanErr) {
      meeting.cleaning_group = nextGroup;
      logs.push(`✅ Assigned cleaning group: ${nextGroup}`);
    }
  }

  // Refetch parts to see final count
  const { data: finalParts } = await supabase
    .from('meeting_parts')
    .select('assigned_user_id')
    .eq('meeting_id', meetingId);
  const assignedCount = finalParts ? finalParts.filter(p => p.assigned_user_id).length : 0;

  logs.push(`🎉 Assignment complete. Total assigned parts: ${assignedCount}/${parts.length}.`);
  return {
    assignedCount,
    totalCount: parts.length,
    logs
  };
}
