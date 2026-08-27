(function () {
  'use strict';

  var STORAGE_KEYS = {
    workouts: 'myfit-workouts-v2',
    history: 'myfit-history-v2',
    activeSession: 'myfit-active-session-v2',
    lastDay: 'myfit-last-day-v2',
    library: 'myfit-library-v1',
    dayOrder: 'myfit-day-order-v1'
  };

  var REST_SET_SECONDS = 60;
  var REST_EXERCISE_SECONDS = 90;
  var WORK_SECONDS_PER_SET = 60;

  // Swap this path later to change the welcome background without layout changes.
  var WELCOME_BACKGROUND_IMAGE = 'assets/welcome-background.jpg';

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

  // Stable repo assets — work on any device without IndexedDB/local image cache.
  var EXERCISE_IMAGE_ASSETS = {
    'a-seated-leg-curl': 'assets/exercises/seated-leg-curl.jpg',
    'a-bulgarian-split-squat': 'assets/exercises/bulgarian-split-squat.jpg',
    'a-sumo-squat': 'assets/exercises/sumo-squat.jpg',
    'a-cable-kickback': 'assets/exercises/cable-kickback.jpg',
    'a-glute-bridge-band-abduction': 'assets/exercises/glute-bridge-band-abduction.jpg',
    'a-extended-range-side-lying-hip-abduction-on-bench': 'assets/exercises/side-lying-hip-abduction.jpg',
    'b-lat-pulldown': 'assets/exercises/lat-pulldown.jpg',
    'b-seated-cable-row': 'assets/exercises/seated-cable-row.jpg',
    'b-dumbbell-shoulder-press': 'assets/exercises/dumbbell-shoulder-press.jpg',
    'b-lateral-raise': 'assets/exercises/lateral-raise.jpg',
    'c-hip-thrust': 'assets/exercises/hip-thrust.jpg',
    'c-step-up': 'assets/exercises/step-up.jpg',
    'c-banded-abduction': 'assets/exercises/banded-abduction.jpg',
    'c-single-leg-glute-bridge': 'assets/exercises/single-leg-glute-bridge.jpg',
    'c-frog-pump': 'assets/exercises/frog-pump.jpg',
    'lib-cable-kickback': 'assets/exercises/cable-kickback.jpg',
    'lib-banded-abduction': 'assets/exercises/banded-abduction.jpg',
    'lib-lateral-raise': 'assets/exercises/lateral-raise.jpg',
    'lib-face-pull': 'assets/exercises/face-pull.jpg',
    'lib-calf-raise': 'assets/exercises/calf-raise.jpg'
  };

  var EXERCISE_IMAGE_BY_NAME = {
    'seated leg curl / leg curl máy': 'assets/exercises/seated-leg-curl.jpg',
    'seated leg curl': 'assets/exercises/seated-leg-curl.jpg',
    'leg curl máy': 'assets/exercises/seated-leg-curl.jpg',
    'bulgarian split squat': 'assets/exercises/bulgarian-split-squat.jpg',
    'sumo squat': 'assets/exercises/sumo-squat.jpg',
    'cable kickback': 'assets/exercises/cable-kickback.jpg',
    'glute bridge + band abduction': 'assets/exercises/glute-bridge-band-abduction.jpg',
    'extended range side-lying hip abduction on bench': 'assets/exercises/side-lying-hip-abduction.jpg',
    'lat pulldown': 'assets/exercises/lat-pulldown.jpg',
    'seated cable row': 'assets/exercises/seated-cable-row.jpg',
    'dumbbell shoulder press': 'assets/exercises/dumbbell-shoulder-press.jpg',
    'lateral raise': 'assets/exercises/lateral-raise.jpg',
    'hip thrust': 'assets/exercises/hip-thrust.jpg',
    'step-up': 'assets/exercises/step-up.jpg',
    'banded abduction': 'assets/exercises/banded-abduction.jpg',
    'single-leg glute bridge': 'assets/exercises/single-leg-glute-bridge.jpg',
    'frog pump': 'assets/exercises/frog-pump.jpg',
    'face pull': 'assets/exercises/face-pull.jpg',
    'calf raise': 'assets/exercises/calf-raise.jpg'
  };

  function isStableAssetPath(src) {
    var value = String(src || '');
    return (
      value.indexOf('assets/') === 0 ||
      value.indexOf('./assets/') === 0
    );
  }

  function catalogImageForExercise(exercise) {
    if (!exercise) return '';
    if (exercise.id && EXERCISE_IMAGE_ASSETS[exercise.id]) {
      return EXERCISE_IMAGE_ASSETS[exercise.id];
    }
    var nameKey = String(exercise.name || '').trim().toLowerCase();
    if (EXERCISE_IMAGE_BY_NAME[nameKey]) return EXERCISE_IMAGE_BY_NAME[nameKey];
    return '';
  }

  function createExercise(workoutId, legacyRow, extras) {
    var parsed = parseLegacyMeta(legacyRow[1]);
    var resistance = parseLegacyResistance(legacyRow[2]);
    var exercise = {
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
    if (extras && typeof extras === 'object') {
      Object.keys(extras).forEach(function (key) {
        exercise[key] = extras[key];
      });
    }
    if (!exercise.image) {
      exercise.image = catalogImageForExercise(exercise);
    }
    return exercise;
  }

  function createLegCurlActivation() {
    return {
      id: 'a-seated-leg-curl',
      name: 'Seated Leg Curl / Leg Curl máy',
      image: EXERCISE_IMAGE_ASSETS['a-seated-leg-curl'],
      imageId: '',
      instructions: 'Tư thế bắt đầu → gập gối kéo con lăn về phía mông → trở về chậm. Bài khởi động/kích hoạt đùi sau, không phải bài chính.',
      notes: 'Tập nhẹ, kiểm soát động tác, tập trung cảm nhận đùi sau.',
      sets: 3,
      reps: 18,
      repsRange: '15–20',
      resistance: 0,
      resistanceType: 'kg'
    };
  }

  var DEFAULT_WORKOUTS = {
    a: {
      id: 'a',
      title: '🍑 Glutes A',
      exercises: [
        createLegCurlActivation(),
        createExercise('a', ['Bulgarian Split Squat', '3 × 10 / bên', '3–5 kg', 'Xuống chậm, đầu gối trước đi theo hướng mũi chân.']),
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

  function migrateGlutesALegCurl(workouts) {
    if (!workouts || !workouts.a || !Array.isArray(workouts.a.exercises)) {
      return { workouts: workouts, changed: false };
    }
    var exercises = workouts.a.exercises;
    if (!exercises.length) return { workouts: workouts, changed: false };
    var first = exercises[0];
    var firstName = String(first.name || '');
    if (/leg\s*curl/i.test(firstName)) {
      var changed = false;
      var catalog = catalogImageForExercise(first) || EXERCISE_IMAGE_ASSETS['a-seated-leg-curl'];
      if (!isStableAssetPath(first.image)) {
        first.image = catalog;
        changed = true;
      } else if (first.image === 'assets/leg-curl-machine.jpg') {
        first.image = catalog;
        changed = true;
      }
      if (!first.repsRange) {
        first.repsRange = '15–20';
        changed = true;
      }
      if (!first.notes) {
        first.notes = 'Tập nhẹ, kiểm soát động tác, tập trung cảm nhận đùi sau.';
        changed = true;
      }
      return { workouts: workouts, changed: changed };
    }
    if (firstName === 'Bulgarian Split Squat') {
      var hasLegCurl = exercises.some(function (ex) {
        return /leg\s*curl/i.test(String(ex && ex.name || ''));
      });
      if (hasLegCurl) {
        // Order may have been customized; do not re-insert Leg Curl.
        return { workouts: workouts, changed: false };
      }
      workouts.a.exercises = [createLegCurlActivation()].concat(exercises);
      return { workouts: workouts, changed: true };
    }
    return { workouts: workouts, changed: false };
  }

  function migrateGlutesARemoveRomanianDeadlift(workouts) {
    if (!workouts || !workouts.a || !Array.isArray(workouts.a.exercises)) {
      return { workouts: workouts, changed: false };
    }
    var before = workouts.a.exercises;
    var after = before.filter(function (exercise) {
      return !/romanian\s*deadlift/i.test(String(exercise && exercise.name || ''));
    });
    if (after.length === before.length) {
      return { workouts: workouts, changed: false };
    }
    workouts.a.exercises = after;
    return { workouts: workouts, changed: true };
  }

  // Point known exercises at repo assets so images work on any device.
  // Does not clear History or custom user-uploaded imageId blobs.
  function migrateExerciseAssetImages(workouts) {
    if (!workouts || typeof workouts !== 'object') {
      return { workouts: workouts, changed: false };
    }
    var changed = false;
    Object.keys(workouts).forEach(function (workoutId) {
      var workout = workouts[workoutId];
      if (!workout || !Array.isArray(workout.exercises)) return;
      workout.exercises.forEach(function (exercise) {
        var catalog = catalogImageForExercise(exercise);
        if (!catalog) return;
        if (exercise.image === 'assets/leg-curl-machine.jpg') {
          exercise.image = catalog;
          changed = true;
          return;
        }
        if (!isStableAssetPath(exercise.image)) {
          exercise.image = catalog;
          changed = true;
        }
      });
    });
    return { workouts: workouts, changed: changed };
  }

  function loadWorkouts() {
    var stored = readJson(STORAGE_KEYS.workouts, null);
    var migrated = migrateLegacyWorkouts(stored);
    var workouts = migrated ? normalizeWorkouts(migrated) : normalizeWorkouts(clone(DEFAULT_WORKOUTS));
    var legCurlResult = migrateGlutesALegCurl(workouts);
    workouts = legCurlResult.workouts;
    var rdlResult = migrateGlutesARemoveRomanianDeadlift(workouts);
    workouts = rdlResult.workouts;
    var imageResult = migrateExerciseAssetImages(workouts);
    workouts = imageResult.workouts;
    if (legCurlResult.changed || rdlResult.changed || imageResult.changed || !stored) saveWorkouts(workouts);
    return workouts;
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
    if (!exercise.resistance) return 'Nhẹ';
    return exercise.resistance + ' kg';
  }

  function formatExerciseMeta(exercise) {
    var reps = exercise.repsRange || exercise.reps;
    return exercise.sets + ' × ' + reps + ' · ' + formatResistance(exercise);
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
      repsRange: exercise.repsRange || '',
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

  function createSetLogs(exercise) {
    var sets = Math.max(1, parseInt(exercise.sets, 10) || 1);
    var logs = [];
    var i;
    for (i = 0; i < sets; i += 1) {
      logs.push({
        setNumber: i + 1,
        resistance: exercise.resistance != null ? exercise.resistance : 0,
        resistanceType: exercise.resistanceType || 'kg',
        reps: exercise.reps != null ? exercise.reps : 1,
        completed: false
      });
    }
    return logs;
  }

  function ensureSetLogs(item) {
    if (!item || typeof item !== 'object') return item;
    if (Array.isArray(item.setLogs) && item.setLogs.length) return item;
    var snap = item.snapshot || {};
    var planned = Math.max(1, parseInt(item.plannedSets || snap.sets, 10) || 1);
    var completed = Math.max(0, parseInt(item.actualSetsCompleted, 10) || 0);
    var resistance = item.actualResistance != null ? item.actualResistance : (item.plannedResistance != null ? item.plannedResistance : snap.resistance);
    var resistanceType = item.plannedResistanceType || snap.resistanceType || 'kg';
    var reps = item.actualReps != null ? item.actualReps : (item.plannedReps != null ? item.plannedReps : snap.reps);
    var logs = [];
    var i;
    for (i = 0; i < planned; i += 1) {
      logs.push({
        setNumber: i + 1,
        resistance: resistance != null ? resistance : 0,
        resistanceType: resistanceType,
        reps: reps != null ? reps : 1,
        completed: i < completed
      });
    }
    item.setLogs = logs;
    if (!item.role) item.role = 'scheduled';
    return item;
  }

  function formatSetLogLine(log) {
    if (!log) return '';
    var label = 'SET ' + (log.setNumber || '?') + ' – ';
    if (log.resistanceType === 'bodyweight') return label + 'Bodyweight';
    if (log.resistanceType === 'band') {
      return label + (log.resistance > 0 ? 'Band · ' + log.resistance : 'Band');
    }
    if (!log.resistance) return label + 'Nhẹ';
    return label + log.resistance + ' kg';
  }

  function createSessionExercise(exercise, role) {
    var snap = snapshotExercise(exercise);
    return {
      exerciseId: snap.id,
      snapshot: snap,
      role: role === 'supplemental' ? 'supplemental' : 'scheduled',
      plannedSets: snap.sets,
      plannedReps: snap.reps,
      plannedResistance: snap.resistance,
      plannedResistanceType: snap.resistanceType,
      actualSetsCompleted: 0,
      actualReps: snap.reps,
      actualResistance: snap.resistance,
      setLogs: createSetLogs(snap),
      completionStatus: 'pending'
    };
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function dayOrderKey(workoutId, dateStr) {
    return String(dateStr || todayKey()) + ':' + String(workoutId || '');
  }

  function loadDayOrderMap() {
    var map = readJson(STORAGE_KEYS.dayOrder, {});
    return map && typeof map === 'object' ? map : {};
  }

  function saveDayOrderMap(map) {
    writeJson(STORAGE_KEYS.dayOrder, map || {});
  }

  function getDayOrder(workoutId, dateStr) {
    var map = loadDayOrderMap();
    var key = dayOrderKey(workoutId, dateStr);
    return Array.isArray(map[key]) ? map[key].slice() : null;
  }

  function setDayOrder(workoutId, orderIds, dateStr) {
    var map = loadDayOrderMap();
    map[dayOrderKey(workoutId, dateStr)] = (orderIds || []).slice();
    saveDayOrderMap(map);
  }

  function clearDayOrder(workoutId, dateStr) {
    var map = loadDayOrderMap();
    delete map[dayOrderKey(workoutId, dateStr)];
    saveDayOrderMap(map);
  }

  function applyOrderToExercises(exercises, orderIds) {
    if (!Array.isArray(exercises) || !Array.isArray(orderIds) || !orderIds.length) {
      return exercises ? exercises.slice() : [];
    }
    var byId = {};
    exercises.forEach(function (ex) {
      if (ex && ex.id) byId[ex.id] = ex;
    });
    var ordered = [];
    var seen = {};
    orderIds.forEach(function (id) {
      if (byId[id] && !seen[id]) {
        ordered.push(byId[id]);
        seen[id] = true;
      }
    });
    exercises.forEach(function (ex) {
      if (ex && ex.id && !seen[ex.id]) ordered.push(ex);
    });
    return ordered;
  }

  function getOrderedWorkoutExercises(workout, dateStr) {
    if (!workout) return [];
    var order = getDayOrder(workout.id, dateStr);
    if (!order) return (workout.exercises || []).slice();
    return applyOrderToExercises(workout.exercises || [], order);
  }

  function createWorkoutSession(workout, options) {
    options = options || {};
    var exercises = options.exercises
      ? options.exercises.slice()
      : getOrderedWorkoutExercises(workout, options.date || todayKey());
    var role = options.defaultRole || 'scheduled';
    return {
      id: 'session-' + Date.now(),
      workoutId: workout.id,
      workoutName: options.workoutName || workout.title,
      sessionKind: options.sessionKind || 'schedule',
      date: options.date || todayKey(),
      startTime: new Date().toISOString(),
      endTime: null,
      estimatedDuration: estimateWorkoutSeconds({ exercises: exercises }),
      actualDuration: null,
      currentExerciseIndex: 0,
      currentSet: 1,
      phase: 'exercise',
      restKind: null,
      restEndTime: null,
      restRemaining: 0,
      exercises: exercises.map(function (exercise) {
        return createSessionExercise(exercise, options.roleFor && options.roleFor(exercise) || role);
      })
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
      sessionKind: session.sessionKind || 'schedule',
      startTime: session.startTime,
      endTime: session.endTime,
      estimatedDuration: session.estimatedDuration,
      actualDuration: Math.max(0, Math.round((end - start) / 1000)),
      exercises: (session.exercises || []).map(function (item) {
        return clone(ensureSetLogs(item));
      })
    };
  }

  function createLibraryExercise(name, extras) {
    var exercise = {
      id: makeExerciseId('lib', name),
      name: name,
      image: '',
      imageId: '',
      instructions: '',
      notes: '',
      sets: 3,
      reps: 12,
      resistance: 0,
      resistanceType: 'kg'
    };
    if (extras && typeof extras === 'object') {
      Object.keys(extras).forEach(function (key) {
        exercise[key] = extras[key];
      });
    }
    if (!exercise.image) exercise.image = catalogImageForExercise(exercise) || '';
    return exercise;
  }

  var DEFAULT_LIBRARY = [
    createLibraryExercise('Cable Kickback', {
      image: 'assets/exercises/cable-kickback.jpg',
      instructions: 'Khi thu chân về, co gối sâu; khi đá ra sau, đá hơi chéo để siết mông.',
      sets: 3,
      reps: 15,
      resistanceType: 'band'
    }),
    createLibraryExercise('Banded Abduction', {
      image: 'assets/exercises/banded-abduction.jpg',
      instructions: 'Mở gối chậm, giữ căng dây.',
      sets: 3,
      reps: 20,
      resistanceType: 'band'
    }),
    createLibraryExercise('Lateral Raise', {
      image: 'assets/exercises/lateral-raise.jpg',
      instructions: 'Nâng đến khoảng ngang vai, không vung tạ.',
      sets: 3,
      reps: 15,
      resistance: 2,
      resistanceType: 'kg'
    }),
    createLibraryExercise('Face Pull', {
      image: 'assets/exercises/face-pull.jpg',
      instructions: 'Kéo cáp về phía mặt, khuỷu tay cao, siết lưng trên.',
      sets: 3,
      reps: 12,
      resistanceType: 'band'
    }),
    createLibraryExercise('Calf Raise', {
      image: 'assets/exercises/calf-raise.jpg',
      instructions: 'Nhón gót có kiểm soát, dừng nhẹ ở đỉnh rồi hạ chậm.',
      sets: 3,
      reps: 15,
      resistanceType: 'bodyweight'
    })
  ];

  function normalizeLibraryExercise(exercise) {
    return normalizeExercise(exercise, 'lib');
  }

  function loadLibrary() {
    var stored = readJson(STORAGE_KEYS.library, null);
    if (!stored || !Array.isArray(stored.exercises)) {
      var fresh = { exercises: clone(DEFAULT_LIBRARY) };
      writeJson(STORAGE_KEYS.library, fresh);
      return fresh;
    }
    stored.exercises = stored.exercises.map(normalizeLibraryExercise);
    // Ensure seed catalog items exist by id without wiping user-added ones
    var byId = {};
    stored.exercises.forEach(function (ex) { byId[ex.id] = true; });
    var changed = false;
    DEFAULT_LIBRARY.forEach(function (seed) {
      if (!byId[seed.id]) {
        stored.exercises.push(clone(seed));
        changed = true;
      }
    });
    if (changed) writeJson(STORAGE_KEYS.library, stored);
    return stored;
  }

  function saveLibrary(library) {
    writeJson(STORAGE_KEYS.library, library);
  }

  function migrateActiveSessionShape(session) {
    if (!session || !Array.isArray(session.exercises)) return session;
    if (!session.sessionKind) session.sessionKind = session.workoutId === 'library' ? 'library' : 'schedule';
    session.exercises = session.exercises.map(function (item) {
      return ensureSetLogs(item);
    });
    return session;
  }

  function loadActiveSession() {
    return migrateActiveSessionShape(readJson(STORAGE_KEYS.activeSession, null));
  }

  function getTodayWeekIndex() {
    var day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  }

  function getTodayWorkoutId() {
    var today = WEEK_DAYS[getTodayWeekIndex()];
    if (today && today.workoutId) return today.workoutId;
    return 'a';
  }

  window.MyFitData = {
    STORAGE_KEYS: STORAGE_KEYS,
    REST_SET_SECONDS: REST_SET_SECONDS,
    REST_EXERCISE_SECONDS: REST_EXERCISE_SECONDS,
    WORK_SECONDS_PER_SET: WORK_SECONDS_PER_SET,
    WEEK_DAYS: WEEK_DAYS,
    WELCOME_BACKGROUND_IMAGE: WELCOME_BACKGROUND_IMAGE,
    DEFAULT_WORKOUTS: DEFAULT_WORKOUTS,
    EXERCISE_IMAGE_ASSETS: EXERCISE_IMAGE_ASSETS,
    catalogImageForExercise: catalogImageForExercise,
    isStableAssetPath: isStableAssetPath,
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
    createSetLogs: createSetLogs,
    ensureSetLogs: ensureSetLogs,
    formatSetLogLine: formatSetLogLine,
    DEFAULT_LIBRARY: DEFAULT_LIBRARY,
    loadLibrary: loadLibrary,
    saveLibrary: saveLibrary,
    createLibraryExercise: createLibraryExercise,
    getDayOrder: getDayOrder,
    setDayOrder: setDayOrder,
    clearDayOrder: clearDayOrder,
    getOrderedWorkoutExercises: getOrderedWorkoutExercises,
    applyOrderToExercises: applyOrderToExercises,
    todayKey: todayKey,
    getTodayWeekIndex: getTodayWeekIndex,
    getTodayWorkoutId: getTodayWorkoutId,
    makeExerciseId: makeExerciseId,
    formatTime: formatTime,
    formatDateVi: formatDateVi,
    completionStatusLabel: completionStatusLabel,
    summarizeHistoryEntry: summarizeHistoryEntry
  };
})();
