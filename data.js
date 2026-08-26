(function () {
  'use strict';

  var STORAGE_KEYS = {
    workouts: 'myfit-workouts-v2',
    history: 'myfit-history-v2',
    activeSession: 'myfit-active-session-v2',
    lastDay: 'myfit-last-day-v2'
  };

  var REST_SET_SECONDS = 60;
  var REST_EXERCISE_SECONDS = 90;
  var WORK_SECONDS_PER_SET = 60;

  var WEEK_DAYS = [
    { key: 't2', label: 'T2', emoji: '🍑', workoutId: 'a' },
    { key: 't3', label: 'T3', emoji: '🏓', workoutId: null },
    { key: 't4', label: 'T4', emoji: '💪', workoutId: 'b' },
    { key: 't5', label: 'T5', emoji: '🏓', workoutId: null },
    { key: 't6', label: 'T6', emoji: '🍑', workoutId: 'c' },
    { key: 't7', label: 'T7', emoji: '🧘', workoutId: null },
    { key: 'cn', label: 'CN', emoji: '😴', workoutId: null }
  ];

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function makeExerciseId(workoutId, name) {
    return workoutId + '-' + slugify(name);
  }

  function parseLegacyMeta(meta) {
    var sets = 3;
    var reps = 10;
    var match = String(meta || '').match(/(\d+)\s*[×x]\s*(\d+(?:\s*[–-]\s*\d+)?)/i);
    if (match) {
      sets = parseInt(match[1], 10) || 3;
      var repPart = match[2];
      if (/[–-]/.test(repPart)) {
        var parts = repPart.split(/[–-]/).map(function (n) { return parseInt(n.trim(), 10) || 0; });
        reps = Math.round((parts[0] + parts[1]) / 2);
      } else {
        reps = parseInt(repPart, 10) || 10;
      }
    }
    return { sets: sets, reps: reps };
  }

  function parseLegacyResistance(text) {
    var value = String(text || '').trim().toLowerCase();
    if (!value) return { resistance: 0, resistanceType: 'bodyweight' };
    if (value.indexOf('bodyweight') >= 0) return { resistance: 0, resistanceType: 'bodyweight' };
    if (value.indexOf('band') >= 0 || value.indexOf('dây') >= 0 || value.indexOf('nhẹ') >= 0 || value === 'vừa') {
      var bandMatch = value.match(/(\d+(?:\.\d+)?)/);
      return { resistance: bandMatch ? parseFloat(bandMatch[1]) : 0, resistanceType: 'band' };
    }
    var kgMatch = value.match(/(\d+(?:\.\d+)?)/);
    if (kgMatch) return { resistance: parseFloat(kgMatch[1]), resistanceType: 'kg' };
    return { resistance: 0, resistanceType: 'kg' };
  }

  function createExercise(workoutId, legacyRow) {
    var parsed = parseLegacyMeta(legacyRow[1]);
    var resistance = parseLegacyResistance(legacyRow[2]);
    return {
      id: makeExerciseId(workoutId, legacyRow[0]),
      name: legacyRow[0],
      image: '',
      imageId: '',
      instructions: legacyRow[3] || '',
      notes: '',
      sets: parsed.sets,
      reps: parsed.reps,
      resistance: resistance.resistance,
      resistanceType: resistance.resistanceType
    };
  }

  var DEFAULT_WORKOUTS = {
    a: {
      id: 'a',
      title: '🍑 Glutes A',
      exercises: [
        createExercise('a', ['Bulgarian Split Squat', '3 × 10 / bên', '3–5 kg', 'Xuống chậm, đầu gối trước đi theo hướng mũi chân.']),
        createExercise('a', ['Romanian Deadlift', '3 × 10–12', '5 kg', 'Đẩy hông ra sau, lưng trung lập.']),
        createExercise('a', ['Sumo Squat', '3 × 12–15', '5 kg', 'Chân rộng, gối mở theo hướng mũi chân.']),
        createExercise('a', ['Cable Kickback', '3 × 15 / bên', 'Nhẹ–vừa', 'Khi thu chân về, co gối sâu; khi đá ra sau, đá hơi chéo để siết mông.']),
        createExercise('a', ['Glute Bridge + Band Abduction', '3 × 12–15', 'Band', 'Nằm trên thảm, dây ở đùi; nâng mông rồi mở gối có kiểm soát.']),
        createExercise('a', ['Extended Range Side-Lying Hip Abduction on Bench', '3 × 12–15 / bên', 'Band', 'Nằm nghiêng trên ghế; chân dưới ổn định, chân trên mở từ khớp hông trong biên độ kiểm soát.'])
      ]
    },
    b: {
      id: 'b',
      title: '💪 Upper Body',
      exercises: [
        createExercise('b', ['Lat Pulldown', '3 × 10–12', 'Vừa', 'Kéo khuỷu tay xuống, không nhún vai.']),
        createExercise('b', ['Seated Cable Row', '3 × 10–12', 'Vừa', 'Giữ ngực mở, kéo khuỷu tay về sau.']),
        createExercise('b', ['Dumbbell Shoulder Press', '3 × 10–12', 'Nhẹ–vừa', 'Giữ cổ tay trung lập.']),
        createExercise('b', ['Lateral Raise', '3 × 12–15', '1–3 kg', 'Nâng đến khoảng ngang vai, không vung tạ.'])
      ]
    },
    c: {
      id: 'c',
      title: '🍑 Glutes B',
      exercises: [
        createExercise('c', ['Hip Thrust', '3 × 10–12', 'Vừa', 'Siết mông ở đỉnh, không ưỡn lưng.']),
        createExercise('c', ['Step-Up', '3 × 10 / bên', 'Nhẹ–vừa', 'Đạp bằng chân trên bục, kiểm soát khi xuống.']),
        createExercise('c', ['Banded Abduction', '3 × 20', 'Band', 'Mở gối chậm, giữ căng dây.']),
        createExercise('c', ['Single-Leg Glute Bridge', '3 × 12 / bên', 'Bodyweight', 'Giữ xương chậu ổn định.']),
        createExercise('c', ['Frog Pump', '3 × 20', 'Bodyweight', 'Hai bàn chân áp nhau, nâng hông và siết mông.'])
      ]
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to read storage', key, err);
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function migrateLegacyWorkouts(stored) {
    if (!stored || typeof stored !== 'object') return null;
    var firstWorkout = stored.a || stored.b || stored.c;
    if (!firstWorkout) return null;
    if (firstWorkout.exercises && firstWorkout.exercises[0] && firstWorkout.exercises[0].sets !== undefined) {
      return stored;
    }
    var migrated = {};
    Object.keys(DEFAULT_WORKOUTS).forEach(function (workoutId) {
      var legacy = stored[workoutId];
      if (!legacy || !legacy.items) {
        migrated[workoutId] = clone(DEFAULT_WORKOUTS[workoutId]);
        return;
      }
      migrated[workoutId] = {
        id: workoutId,
        title: legacy.title || DEFAULT_WORKOUTS[workoutId].title,
        exercises: legacy.items.map(function (row) {
          return createExercise(workoutId, row);
        })
      };
    });
    return migrated;
  }

  function normalizeExercise(exercise, workoutId) {
    if (!exercise || typeof exercise !== 'object') return exercise;
    if (!exercise.id) exercise.id = makeExerciseId(workoutId, exercise.name || 'exercise');
    if (exercise.imageId === undefined) exercise.imageId = '';
    if (exercise.image === undefined) exercise.image = '';
    if (exercise.instructions === undefined) exercise.instructions = '';
    if (exercise.notes === undefined) exercise.notes = '';
    exercise.sets = Math.max(1, parseInt(exercise.sets, 10) || 1);
    exercise.reps = Math.max(1, parseInt(exercise.reps, 10) || 1);
    exercise.resistance = Math.max(0, parseFloat(exercise.resistance) || 0);
    if (!exercise.resistanceType) exercise.resistanceType = 'kg';
    return exercise;
  }

  function normalizeWorkouts(workouts) {
    Object.keys(workouts || {}).forEach(function (workoutId) {
      var workout = workouts[workoutId];
      if (!workout || !workout.exercises) return;
      workout.exercises = workout.exercises.map(function (exercise) {
        return normalizeExercise(exercise, workoutId);
      });
    });
    return workouts;
  }

  function loadWorkouts() {
    var stored = readJson(STORAGE_KEYS.workouts, null);
    var migrated = migrateLegacyWorkouts(stored);
    if (migrated) return normalizeWorkouts(migrated);
    return normalizeWorkouts(clone(DEFAULT_WORKOUTS));
  }

  function saveWorkouts(workouts) {
    writeJson(STORAGE_KEYS.workouts, workouts);
  }

  function loadHistory() {
    return readJson(STORAGE_KEYS.history, []);
  }

  function saveHistory(history) {
    writeJson(STORAGE_KEYS.history, history);
  }

  function loadActiveSession() {
    return readJson(STORAGE_KEYS.activeSession, null);
  }

  function saveActiveSession(session) {
    if (session) writeJson(STORAGE_KEYS.activeSession, session);
    else localStorage.removeItem(STORAGE_KEYS.activeSession);
  }

  function loadLastDay() {
    return readJson(STORAGE_KEYS.lastDay, null);
  }

  function saveLastDay(dayKey) {
    writeJson(STORAGE_KEYS.lastDay, dayKey);
  }

  function formatResistance(exercise) {
    if (exercise.resistanceType === 'bodyweight') return 'Bodyweight';
    if (exercise.resistanceType === 'band') {
      return exercise.resistance > 0 ? 'Band · ' + exercise.resistance : 'Band';
    }
    return exercise.resistance + ' kg';
  }

  function formatExerciseMeta(exercise) {
    return exercise.sets + ' × ' + exercise.reps + ' · ' + formatResistance(exercise);
  }

  function estimateWorkoutSeconds(workout) {
    var total = 0;
    workout.exercises.forEach(function (exercise, index) {
      total += exercise.sets * WORK_SECONDS_PER_SET;
      if (exercise.sets > 1) total += (exercise.sets - 1) * REST_SET_SECONDS;
      if (index < workout.exercises.length - 1) total += REST_EXERCISE_SECONDS;
    });
    return total;
  }

  function formatDuration(seconds) {
    var mins = Math.max(1, Math.round(seconds / 60));
    return mins + ' phút';
  }

  function formatClockDuration(seconds) {
    var safe = Math.max(0, Math.round(seconds));
    var mins = Math.floor(safe / 60);
    var secs = safe % 60;
    return mins + ' phút ' + String(secs).padStart(2, '0') + ' giây';
  }

  function snapshotExercise(exercise) {
    return {
      id: exercise.id,
      name: exercise.name,
      image: exercise.image || '',
      imageId: exercise.imageId || '',
      instructions: exercise.instructions || '',
      notes: exercise.notes || '',
      sets: exercise.sets,
      reps: exercise.reps,
      resistance: exercise.resistance,
      resistanceType: exercise.resistanceType
    };
  }

  function formatTime(iso) {
    if (!iso) return '—';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  function formatDateVi(isoDate) {
    if (!isoDate) return '—';
    var parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function completionStatusLabel(status) {
    if (status === 'completed') return 'Hoàn thành';
    if (status === 'in-progress') return 'Đang tập';
    return 'Chưa tập';
  }

  function summarizeHistoryEntry(entry) {
    var plannedSets = 0;
    var actualSets = 0;
    (entry.exercises || []).forEach(function (item) {
      plannedSets += item.plannedSets || (item.snapshot && item.snapshot.sets) || 0;
      actualSets += item.actualSetsCompleted || 0;
    });
    return {
      exerciseCount: (entry.exercises || []).length,
      plannedSets: plannedSets,
      actualSets: actualSets
    };
  }

  function createSessionExercise(exercise) {
    var snap = snapshotExercise(exercise);
    return {
      exerciseId: snap.id,
      snapshot: snap,
      plannedSets: snap.sets,
      plannedReps: snap.reps,
      plannedResistance: snap.resistance,
      plannedResistanceType: snap.resistanceType,
      actualSetsCompleted: 0,
      actualReps: snap.reps,
      actualResistance: snap.resistance,
      completionStatus: 'pending'
    };
  }

  function createWorkoutSession(workout) {
    return {
      id: 'session-' + Date.now(),
      workoutId: workout.id,
      workoutName: workout.title,
      date: new Date().toISOString().slice(0, 10),
      startTime: new Date().toISOString(),
      endTime: null,
      estimatedDuration: estimateWorkoutSeconds(workout),
      actualDuration: null,
      currentExerciseIndex: 0,
      currentSet: 1,
      phase: 'exercise',
      restKind: null,
      restEndTime: null,
      restRemaining: 0,
      exercises: workout.exercises.map(createSessionExercise)
    };
  }

  function finalizeHistoryEntry(session) {
    var end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
    var start = new Date(session.startTime).getTime();
    return {
      id: session.id,
      date: session.date,
      workoutId: session.workoutId,
      workoutName: session.workoutName,
      startTime: session.startTime,
      endTime: session.endTime,
      estimatedDuration: session.estimatedDuration,
      actualDuration: Math.max(0, Math.round((end - start) / 1000)),
      exercises: session.exercises.map(function (item) {
        return clone(item);
      })
    };
  }

  function getTodayWeekIndex() {
    var day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  }

  window.MyFitData = {
    STORAGE_KEYS: STORAGE_KEYS,
    REST_SET_SECONDS: REST_SET_SECONDS,
    REST_EXERCISE_SECONDS: REST_EXERCISE_SECONDS,
    WORK_SECONDS_PER_SET: WORK_SECONDS_PER_SET,
    WEEK_DAYS: WEEK_DAYS,
    DEFAULT_WORKOUTS: DEFAULT_WORKOUTS,
    clone: clone,
    loadWorkouts: loadWorkouts,
    saveWorkouts: saveWorkouts,
    loadHistory: loadHistory,
    saveHistory: saveHistory,
    loadActiveSession: loadActiveSession,
    saveActiveSession: saveActiveSession,
    loadLastDay: loadLastDay,
    saveLastDay: saveLastDay,
    formatResistance: formatResistance,
    formatExerciseMeta: formatExerciseMeta,
    estimateWorkoutSeconds: estimateWorkoutSeconds,
    formatDuration: formatDuration,
    formatClockDuration: formatClockDuration,
    snapshotExercise: snapshotExercise,
    createSessionExercise: createSessionExercise,
    createWorkoutSession: createWorkoutSession,
    finalizeHistoryEntry: finalizeHistoryEntry,
    getTodayWeekIndex: getTodayWeekIndex,
    makeExerciseId: makeExerciseId,
    formatTime: formatTime,
    formatDateVi: formatDateVi,
    completionStatusLabel: completionStatusLabel,
    summarizeHistoryEntry: summarizeHistoryEntry
  };
})();
