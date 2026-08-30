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

  var MUSCLE_GROUP_CONFIG = [
    {
      id: 'chest',
      label: 'Ngực',
      subgroups: [
        { id: 'upper_chest', label: 'Ngực trên' },
        { id: 'middle_chest', label: 'Ngực giữa' },
        { id: 'lower_chest', label: 'Ngực dưới' }
      ]
    },
    {
      id: 'back',
      label: 'Lưng',
      subgroups: [
        {
          id: 'traps',
          label: 'Cơ thang (Trap)',
          children: [
            { id: 'trap_upper', label: 'Trap trên' },
            { id: 'trap_middle', label: 'Trap giữa' },
            { id: 'trap_lower', label: 'Trap dưới' }
          ]
        },
        { id: 'lats', label: 'Cơ xô (Latissimus Dorsi / Lats)' },
        {
          id: 'rhomboids',
          label: 'Cơ trám',
          children: [
            { id: 'rhomboid_major', label: 'Trám lớn' },
            { id: 'rhomboid_minor', label: 'Trám bé' }
          ]
        },
        { id: 'teres_major', label: 'Cơ tròn lớn (Teres Major)' },
        { id: 'erector_spinae', label: 'Cơ dựng sống (Erector Spinae)' },
        { id: 'quadratus_lumborum', label: 'Cơ vuông thắt lưng (Quadratus Lumborum)' }
      ]
    },
    {
      id: 'shoulders',
      label: 'Vai',
      subgroups: [
        { id: 'front_delts', label: 'Vai trước' },
        { id: 'side_delts', label: 'Vai giữa' },
        { id: 'rear_delts', label: 'Vai sau' }
      ]
    },
    {
      id: 'biceps',
      label: 'Tay trước',
      subgroups: [
        { id: 'biceps_long_head', label: 'Biceps đầu dài' },
        { id: 'biceps_short_head', label: 'Biceps đầu ngắn' },
        { id: 'brachialis', label: 'Brachialis' },
        { id: 'brachioradialis', label: 'Brachioradialis' }
      ]
    },
    {
      id: 'triceps',
      label: 'Tay sau',
      subgroups: [
        { id: 'triceps_long_head', label: 'Triceps đầu dài' },
        { id: 'triceps_lateral_head', label: 'Triceps đầu ngoài' },
        { id: 'triceps_medial_head', label: 'Triceps đầu trong' }
      ]
    },
    {
      id: 'core',
      label: 'Bụng',
      subgroups: [
        { id: 'rectus_abdominis', label: 'Rectus Abdominis' },
        { id: 'obliques', label: 'Obliques' },
        { id: 'transverse_abdominis', label: 'Transverse Abdominis' }
      ]
    },
    {
      id: 'glutes',
      label: 'Mông',
      subgroups: [
        {
          id: 'gluteus_maximus',
          label: 'Mông lớn (Gluteus Maximus)',
          targetAreas: [
            { id: 'upper_glute', label: 'Mông lớn – bó trên' },
            { id: 'lower_glute', label: 'Mông lớn – bó dưới' }
          ]
        },
        { id: 'gluteus_medius', label: 'Mông giữa (Gluteus Medius)' },
        { id: 'gluteus_minimus', label: 'Mông bé (Gluteus Minimus)' },
        { id: 'side_glute', label: 'Mông bên' }
      ]
    },
    {
      id: 'quads',
      label: 'Đùi trước',
      subgroups: [
        { id: 'rectus_femoris', label: 'Rectus Femoris' },
        { id: 'vastus_lateralis', label: 'Vastus Lateralis' },
        { id: 'vastus_medialis', label: 'Vastus Medialis' },
        { id: 'vastus_intermedius', label: 'Vastus Intermedius' }
      ]
    },
    {
      id: 'hamstrings',
      label: 'Đùi sau',
      subgroups: [
        { id: 'biceps_femoris', label: 'Biceps Femoris' },
        { id: 'semitendinosus', label: 'Semitendinosus' },
        { id: 'semimembranosus', label: 'Semimembranosus' }
      ]
    },
    {
      id: 'calves',
      label: 'Bắp chân',
      subgroups: [
        { id: 'gastrocnemius', label: 'Gastrocnemius' },
        { id: 'soleus', label: 'Soleus' }
      ]
    }
  ];

  var MUSCLE_GROUPS = MUSCLE_GROUP_CONFIG.map(function (group) {
    return { id: group.id, label: group.label };
  });
  MUSCLE_GROUPS.push({ id: 'full-body', label: 'Toàn thân' });

  var muscleLookupCache = null;

  function buildMuscleLookupCache() {
    if (muscleLookupCache) return muscleLookupCache;
    var primaryById = {};
    var subgroupById = {};
    var leafById = {};
    MUSCLE_GROUP_CONFIG.forEach(function (primary) {
      primaryById[primary.id] = primary;
      (primary.subgroups || []).forEach(function (sub) {
        subgroupById[sub.id] = { primary: primary, subgroup: sub };
        if (sub.children) {
          sub.children.forEach(function (child) {
            leafById[child.id] = {
              primary: primary,
              subgroup: sub,
              leaf: child,
              kind: 'child'
            };
          });
        }
        if (sub.targetAreas) {
          sub.targetAreas.forEach(function (area) {
            leafById[area.id] = {
              primary: primary,
              subgroup: sub,
              leaf: area,
              kind: 'targetArea'
            };
          });
        }
      });
    });
    muscleLookupCache = { primaryById: primaryById, subgroupById: subgroupById, leafById: leafById };
    return muscleLookupCache;
  }

  function getPrimaryMuscleConfig(primaryId) {
    return buildMuscleLookupCache().primaryById[primaryId] || null;
  }

  function getSubgroupsForPrimary(primaryId) {
    var primary = getPrimaryMuscleConfig(primaryId);
    return primary && primary.subgroups ? primary.subgroups.slice() : [];
  }

  function findSubgroupDef(primaryId, subgroupId) {
    return getSubgroupsForPrimary(primaryId).filter(function (sub) {
      return sub.id === subgroupId;
    })[0] || null;
  }

  function muscleGroupLabel(id) {
    if (!id) return '';
    var cache = buildMuscleLookupCache();
    if (cache.primaryById[id]) return cache.primaryById[id].label;
    if (cache.subgroupById[id]) return cache.subgroupById[id].subgroup.label;
    if (cache.leafById[id]) return cache.leafById[id].leaf.label;
    var legacy = MUSCLE_GROUPS.filter(function (g) { return g.id === id; })[0];
    return legacy ? legacy.label : '';
  }

  function muscleClassificationLabel(exercise) {
    if (!exercise) return '';
    return getMuscleDisplayParts(exercise).map(function (part) { return part.label; }).join(' · ');
  }

  function resolveMuscleFormLevels(exercise) {
    exercise = exercise || {};
    var primary = exercise.primaryMuscleGroup || '';
    var secondary = exercise.secondaryMuscleGroup || '';
    var targetArea = exercise.targetArea || '';
    var leaf = '';
    if (primary && secondary) {
      var leafInfo = buildMuscleLookupCache().leafById[secondary];
      if (leafInfo && leafInfo.kind === 'child') {
        leaf = secondary;
        secondary = leafInfo.subgroup.id;
      }
    }
    return {
      primary: primary,
      secondary: secondary,
      leaf: leaf,
      targetArea: targetArea
    };
  }

  function getMuscleDisplayParts(exercise) {
    if (!exercise) return [];
    var parts = [];
    var seen = {};
    function add(id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      parts.push({ id: id, label: muscleGroupLabel(id) });
    }
    add(exercise.primaryMuscleGroup);
    var secondary = exercise.secondaryMuscleGroup || '';
    if (secondary) {
      var leafInfo = buildMuscleLookupCache().leafById[secondary];
      if (leafInfo && leafInfo.kind === 'child') {
        add(leafInfo.subgroup.id);
        add(secondary);
      } else {
        add(secondary);
      }
    }
    add(exercise.targetArea);
    return parts;
  }

  function createMuscleFilterState() {
    return {
      primaryId: '',
      subgroupId: '',
      leafId: '',
      search: ''
    };
  }

  function cloneMuscleFilterState(state) {
    state = state || createMuscleFilterState();
    return {
      primaryId: state.primaryId || '',
      subgroupId: state.subgroupId || '',
      leafId: state.leafId || '',
      search: state.search || ''
    };
  }

  function resetMuscleFilterLevel(state, level) {
    state = state || createMuscleFilterState();
    if (level === 'all') {
      state.primaryId = '';
      state.subgroupId = '';
      state.leafId = '';
      return state;
    }
    if (level === 'primary') {
      state.subgroupId = '';
      state.leafId = '';
      return state;
    }
    if (level === 'subgroup') {
      state.leafId = '';
      return state;
    }
    return state;
  }

  function getMuscleFilterBreadcrumb(filter) {
    filter = filter || createMuscleFilterState();
    var parts = [];
    if (!filter.primaryId) return parts;
    parts.push({ id: filter.primaryId, label: muscleGroupLabel(filter.primaryId), level: 'primary' });
    if (!filter.subgroupId) return parts;
    parts.push({ id: filter.subgroupId, label: muscleGroupLabel(filter.subgroupId), level: 'subgroup' });
    if (!filter.leafId) return parts;
    parts.push({ id: filter.leafId, label: muscleGroupLabel(filter.leafId), level: 'leaf' });
    return parts;
  }

  function getMuscleFilterSublevelOptions(filter) {
    filter = filter || createMuscleFilterState();
    if (!filter.primaryId) return [];
    if (!filter.subgroupId) {
      return getSubgroupsForPrimary(filter.primaryId);
    }
    var sub = findSubgroupDef(filter.primaryId, filter.subgroupId);
    if (!sub) return [];
    if (sub.children) return sub.children.slice();
    if (sub.targetAreas) return sub.targetAreas.slice();
    return [];
  }

  function exerciseMatchesMuscleFilter(exercise, filter) {
    if (!exercise) return false;
    filter = filter || createMuscleFilterState();
    var search = String(filter.search || '').trim().toLowerCase();
    if (search && String(exercise.name || '').toLowerCase().indexOf(search) < 0) return false;
    if (!filter.primaryId) return true;
    if ((exercise.primaryMuscleGroup || '') !== filter.primaryId) return false;
    if (!filter.subgroupId) return true;

    var secondary = exercise.secondaryMuscleGroup || '';
    var targetArea = exercise.targetArea || '';

    if (filter.leafId) {
      var leafInfo = buildMuscleLookupCache().leafById[filter.leafId];
      if (leafInfo && leafInfo.kind === 'targetArea') {
        return secondary === filter.subgroupId && targetArea === filter.leafId;
      }
      return secondary === filter.leafId;
    }

    var subDef = findSubgroupDef(filter.primaryId, filter.subgroupId);
    if (!subDef) return secondary === filter.subgroupId;

    if (subDef.children) {
      if (secondary === filter.subgroupId) return true;
      return subDef.children.some(function (child) { return child.id === secondary; });
    }
    if (subDef.targetAreas) {
      if (secondary !== filter.subgroupId) return false;
      return true;
    }
    return secondary === filter.subgroupId;
  }

  function filterExercisesByMuscle(exercises, filter) {
    return (exercises || []).filter(function (exercise) {
      return exerciseMatchesMuscleFilter(exercise, filter);
    });
  }

  var INSTRUCTION_IMAGE_TYPES = [
    { id: 'instruction', label: 'Hướng dẫn kỹ thuật' },
    { id: 'anatomy', label: 'Giải phẫu nhóm cơ' },
    { id: 'mistake', label: 'Lỗi thường gặp' },
    { id: 'other', label: 'Khác' }
  ];

  function instructionImageTypeLabel(type) {
    var match = INSTRUCTION_IMAGE_TYPES.filter(function (t) { return t.id === type; })[0];
    return match ? match.label : type || '';
  }

  function normalizeInstructionImages(images) {
    if (!Array.isArray(images)) return [];
    return images.map(function (item, index) {
      if (!item || typeof item !== 'object') return null;
      return {
        type: item.type || 'instruction',
        imageId: item.imageId || '',
        image: item.image || '',
        label: item.label || '',
        order: item.order != null ? item.order : index
      };
    }).filter(function (item) {
      return item && (item.imageId || item.image);
    }).sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
  }

  function normalizeExerciseMetadata(exercise) {
    if (!exercise || typeof exercise !== 'object') return exercise;
    if (exercise.primaryMuscleGroup === undefined) exercise.primaryMuscleGroup = '';
    if (exercise.secondaryMuscleGroup === undefined) exercise.secondaryMuscleGroup = '';
    if (exercise.targetArea === undefined) exercise.targetArea = '';
    if (!Array.isArray(exercise.secondaryMuscleGroups)) exercise.secondaryMuscleGroups = [];
    if (exercise.tips === undefined) exercise.tips = '';
    if (exercise.commonMistakes === undefined) exercise.commonMistakes = '';
    exercise.instructionImages = normalizeInstructionImages(exercise.instructionImages);
    return exercise;
  }

  function stripHeavyInstructionImages(exercise) {
    if (!exercise || !Array.isArray(exercise.instructionImages)) return;
    exercise.instructionImages.forEach(function (item) {
      if (!item) return;
      if (item.imageId && item.image) item.image = '';
      var image = String(item.image || '');
      if (/^data:/i.test(image) && image.length > 180000) item.image = '';
    });
  }

  function stripHeavyExerciseRecord(exercise) {
    if (!exercise) return;
    if (exercise.imageId && exercise.image) exercise.image = '';
    var image = String(exercise.image || '');
    if (/^data:/i.test(image) && image.length > 180000) exercise.image = '';
    stripHeavyInstructionImages(exercise);
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function makeExerciseId(workoutId, name) {
    return workoutId + '-' + slugify(name);
  }

  function exerciseIdentityKey(exercise) {
    return slugify(exercise && exercise.name);
  }

  function isLibExerciseId(id) {
    return String(id || '').indexOf('lib-') === 0;
  }

  function isDefaultCatalogImage(exercise, imagePath) {
    var path = String(imagePath || '').trim();
    if (!path) return true;
    var catalog = catalogImageForExercise(exercise);
    return !!catalog && path === catalog;
  }

  function hasCustomExerciseImage(exercise) {
    if (!exercise) return false;
    if (exercise.imageId) return true;
    var image = String(exercise.image || '').trim();
    if (!image) return false;
    if (/^data:/i.test(image)) return true;
    if (/^https?:\/\//i.test(image)) return true;
    if (/^blob:/i.test(image)) return true;
    return !isDefaultCatalogImage(exercise, image);
  }

  function pickExerciseImageFields(existing, incoming) {
    var a = existing || {};
    var b = incoming || {};
    var aCustom = hasCustomExerciseImage(a);
    var bCustom = hasCustomExerciseImage(b);
    if (bCustom && !aCustom) {
      return { image: b.image || '', imageId: b.imageId || '' };
    }
    if (aCustom && !bCustom) {
      return { image: a.image || '', imageId: a.imageId || '' };
    }
    if (bCustom && aCustom) {
      return { image: b.image || '', imageId: b.imageId || '' };
    }
    return {
      image: b.image || a.image || '',
      imageId: b.imageId || a.imageId || ''
    };
  }

  function pickInstructionImagesFields(existing, incoming) {
    var a = normalizeInstructionImages(existing && existing.instructionImages);
    var b = normalizeInstructionImages(incoming && incoming.instructionImages);
    if (b.length && !a.length) return b;
    if (a.length && !b.length) return a;
    if (b.length >= a.length) return b;
    return a;
  }

  function mergeExerciseMaster(existing, incoming) {
    if (!existing) return clone(incoming);
    if (!incoming) return clone(existing);
    if (isLibExerciseId(existing.id) && !isLibExerciseId(incoming.id)) {
      var schedulePreferred = clone(incoming);
      schedulePreferred.instructionImages = pickInstructionImagesFields(existing, incoming);
      var scheduleImageFields = pickExerciseImageFields(existing, incoming);
      schedulePreferred.image = scheduleImageFields.image;
      schedulePreferred.imageId = scheduleImageFields.imageId;
      return schedulePreferred;
    }
    var base;
    if (!isLibExerciseId(existing.id) && isLibExerciseId(incoming.id)) {
      base = clone(existing);
    } else {
      base = clone(incoming);
      base.id = incoming.id || existing.id;
    }
    var imageFields = pickExerciseImageFields(existing, incoming);
    base.image = imageFields.image;
    base.imageId = imageFields.imageId;
    base.instructionImages = pickInstructionImagesFields(existing, incoming);
    return base;
  }

  function applyMasterFields(target, master) {
    var next = clone(target);
    next.name = master.name;
    var imageFields = pickExerciseImageFields(target, master);
    next.image = imageFields.image;
    next.imageId = imageFields.imageId;
    next.instructions = master.instructions || '';
    next.notes = master.notes || '';
    next.sets = master.sets;
    next.reps = master.reps;
    if (master.repsRange !== undefined) next.repsRange = master.repsRange;
    else delete next.repsRange;
    next.resistance = master.resistance;
    next.resistanceType = master.resistanceType;
    next.primaryMuscleGroup = master.primaryMuscleGroup || '';
    next.secondaryMuscleGroup = master.secondaryMuscleGroup || '';
    next.targetArea = master.targetArea || '';
    next.secondaryMuscleGroups = Array.isArray(master.secondaryMuscleGroups)
      ? master.secondaryMuscleGroups.slice()
      : [];
    next.tips = master.tips || '';
    next.commonMistakes = master.commonMistakes || '';
    next.instructionImages = normalizeInstructionImages(master.instructionImages);
    return next;
  }

  function collectScheduleWorkoutIds(workouts) {
    return ['a', 'b', 'c'].filter(function (wid) {
      return workouts && workouts[wid] && Array.isArray(workouts[wid].exercises);
    });
  }

  function syncLibraryFromWorkouts(workouts, library) {
    library = library && Array.isArray(library.exercises) ? library : { exercises: [] };
    workouts = workouts || {};
    var byKey = {};
    library.exercises.forEach(function (ex) {
      var key = exerciseIdentityKey(ex);
      if (!key) return;
      byKey[key] = mergeExerciseMaster(byKey[key], ex);
    });

    var changed = false;
    collectScheduleWorkoutIds(workouts).forEach(function (wid) {
      workouts[wid].exercises.forEach(function (ex) {
        var key = exerciseIdentityKey(ex);
        if (!key) return;
        var prev = byKey[key];
        var merged = mergeExerciseMaster(prev, ex);
        if (!prev || merged.id !== prev.id || JSON.stringify(merged) !== JSON.stringify(prev)) {
          changed = true;
        }
        byKey[key] = merged;
      });
    });

    var result = [];
    var seen = {};
    collectScheduleWorkoutIds(workouts).forEach(function (wid) {
      workouts[wid].exercises.forEach(function (ex) {
        var key = exerciseIdentityKey(ex);
        if (!key || seen[key]) return;
        seen[key] = true;
        result.push(clone(byKey[key] || ex));
      });
    });
    library.exercises.forEach(function (ex) {
      var key = exerciseIdentityKey(ex);
      if (!key || seen[key]) return;
      seen[key] = true;
      result.push(clone(byKey[key] || ex));
    });

    if (result.length !== library.exercises.length) changed = true;
    return { library: { exercises: result }, changed: changed };
  }

  function propagateExerciseMaster(exercise, workouts, library) {
    var key = exerciseIdentityKey(exercise);
    if (!key) return { workouts: workouts, library: library, changed: false };
    var master = clone(exercise);
    var changed = false;
    library = library && Array.isArray(library.exercises) ? library : { exercises: [] };

    var foundInLibrary = false;
    library.exercises = library.exercises.map(function (ex) {
      if (exerciseIdentityKey(ex) !== key) return ex;
      foundInLibrary = true;
      changed = true;
      return applyMasterFields(ex, master);
    });
    if (!foundInLibrary) {
      library.exercises.push(clone(master));
      changed = true;
    }

    Object.keys(workouts || {}).forEach(function (wid) {
      var workout = workouts[wid];
      if (!workout || !Array.isArray(workout.exercises)) return;
      workout.exercises = workout.exercises.map(function (ex) {
        if (exerciseIdentityKey(ex) !== key) return ex;
        changed = true;
        return applyMasterFields(ex, master);
      });
    });

    return { workouts: workouts, library: library, changed: changed };
  }

  function workoutHasExerciseIdentity(workout, exercise) {
    if (!workout || !Array.isArray(workout.exercises) || !exercise) return false;
    var key = exerciseIdentityKey(exercise);
    return workout.exercises.some(function (ex) {
      return exerciseIdentityKey(ex) === key;
    });
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
    'b-rope-pull-to-belly': 'assets/exercises/seated-cable-row.jpg',
    'b-rope-pull-to-chest': 'assets/exercises/face-pull.jpg',
    'b-incline-y-raise': 'assets/exercises/lateral-raise.jpg',
    'b-dumbbell-6-way-raise': 'assets/exercises/lateral-raise.jpg',
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
    'kéo dây thừng về bụng – khuỷu khép': 'assets/exercises/seated-cable-row.jpg',
    'kéo dây thừng về ngực – khuỷu mở': 'assets/exercises/face-pull.jpg',
    'nâng tạ chữ y trên ghế dốc': 'assets/exercises/lateral-raise.jpg',
    'nâng tạ 6 hướng': 'assets/exercises/lateral-raise.jpg',
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

  function createT4RopePullToBelly() {
    return {
      id: 'b-rope-pull-to-belly',
      name: 'Kéo dây thừng về bụng – khuỷu khép',
      image: EXERCISE_IMAGE_ASSETS['b-rope-pull-to-belly'],
      imageId: '',
      instructions:
        'Ngồi/đứng đúng vị trí theo video minh hoạ. Hai tay nắm dây thừng (rope attachment). ' +
        'Kéo dây thừng về phía BỤNG. Khi kéo: khuỷu tay đi về phía sau và nằm ngang với thân/lưng. ' +
        'Khuỷu tay KHÉP, áp sát thân người. Khi trả dây: đưa tay ra dài về phía trước để lưng được GIÃN HẾT biên độ trước khi kéo lại.',
      notes: 'Cable/máy kéo · dây thừng · 12.5 kg',
      sets: 3,
      reps: 25,
      resistance: 12.5,
      resistanceType: 'kg'
    };
  }

  function createT4RopePullToChest() {
    return {
      id: 'b-rope-pull-to-chest',
      name: 'Kéo dây thừng về ngực – khuỷu mở',
      image: EXERCISE_IMAGE_ASSETS['b-rope-pull-to-chest'],
      imageId: '',
      instructions:
        'Hai tay nắm dây thừng. Kéo dây về phía NGỰC. Khi kéo, hai khuỷu tay MỞ SANG HAI BÊN. ' +
        'Tập trung vào lưng trên/vùng giữa hai bả vai. Trả dây có kiểm soát.',
      notes: 'Cable/máy kéo · dây thừng · 12.5 kg',
      sets: 3,
      reps: 25,
      resistance: 12.5,
      resistanceType: 'kg'
    };
  }

  function createT4InclineYRaise() {
    return {
      id: 'b-incline-y-raise',
      name: 'Nâng tạ chữ Y trên ghế dốc',
      image: EXERCISE_IMAGE_ASSETS['b-incline-y-raise'],
      imageId: '',
      instructions:
        'Nằm úp người trên ghế bench dựng chéo. Hai tay cầm 2 tạ đơn (2 kg mỗi tay). ' +
        'Từ vị trí tay thấp, đưa hai tay lên tạo thành hình CHỮ Y so với thân người. Hạ xuống có kiểm soát rồi lặp lại.',
      notes: 'Bench dựng chéo · 2 kg/tay',
      sets: 3,
      reps: 20,
      resistance: 2,
      resistanceType: 'kg'
    };
  }

  function createT4Dumbbell6WayRaise() {
    return {
      id: 'b-dumbbell-6-way-raise',
      name: 'Nâng tạ 6 hướng',
      image: EXERCISE_IMAGE_ASSETS['b-dumbbell-6-way-raise'],
      imageId: '',
      instructions:
        'MỘT ĐỘNG TÁC LIÊN TỤC — giữ đúng thứ tự mỗi rep:\n' +
        '1) Hai tay cầm tạ ở hai bên thân\n' +
        '2) Đưa hai tay SANG NGANG\n' +
        '3) Từ ngang, đưa hai tay RA TRƯỚC MẶT\n' +
        '4) Từ trước mặt, đưa hai tay LÊN THẲNG TRÊN ĐẦU\n' +
        '5) Hạ tay từ trên đầu RA TRƯỚC MẶT\n' +
        '6) Đưa tay trở lại vị trí NGANG\n' +
        '7) Hạ tạ xuống hai bên thân\n' +
        'Hoàn thành cả chuỗi mới tính 1 rep.',
      notes: '2 tạ đơn · 1 kg/tay',
      sets: 3,
      reps: 20,
      resistance: 1,
      resistanceType: 'kg'
    };
  }

  function defaultWorkoutBExercisesTail() {
    return [
      createT4RopePullToBelly(),
      createT4RopePullToChest(),
      createT4InclineYRaise(),
      createT4Dumbbell6WayRaise()
    ];
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
      title: '💪 Lưng + Vai',
      exercises: [
        createExercise('b', ['Lat Pulldown', '3 × 10–12', 'Vừa', 'Kéo khuỷu tay xuống, không nhún vai.']),
        createExercise('b', ['Seated Cable Row', '3 × 10–12', 'Vừa', 'Giữ ngực mở, kéo khuỷu tay về sau.'])
      ].concat(defaultWorkoutBExercisesTail())
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
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('localStorage save failed for ' + key, err);
      return false;
    }
  }

  function stripHeavyExerciseImages(workouts) {
    var next = clone(workouts);
    Object.keys(next || {}).forEach(function (workoutId) {
      var workout = next[workoutId];
      if (!workout || !Array.isArray(workout.exercises)) return;
      workout.exercises.forEach(function (exercise) {
        stripHeavyExerciseRecord(exercise);
      });
    });
    return next;
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
    return normalizeExerciseMetadata(exercise);
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
        // User uploads live in imageId — never re-assign catalog over them.
        if (exercise.imageId) return;
        var catalog = catalogImageForExercise(exercise);
        if (!catalog) return;
        if (exercise.image === 'assets/leg-curl-machine.jpg') {
          exercise.image = catalog;
          changed = true;
          return;
        }
        if (isStableAssetPath(exercise.image)) return;
        if (/^https?:\/\//i.test(String(exercise.image || ''))) return;
        if (/^data:/i.test(String(exercise.image || ''))) return;
        if (hasCustomExerciseImage(exercise)) return;
        if (!exercise.image) {
          exercise.image = catalog;
          changed = true;
          return;
        }
        // Legacy broken local paths only.
        if (!isStableAssetPath(exercise.image)) {
          exercise.image = catalog;
          changed = true;
        }
      });
    });
    return { workouts: workouts, changed: changed };
  }

  function mergeTailExercisePreservingImage(existing, defaults) {
    var next = clone(defaults);
    if (!existing || existing.id !== defaults.id) return next;
    var imageFields = pickExerciseImageFields(existing, defaults);
    next.image = imageFields.image;
    next.imageId = imageFields.imageId;
    if (existing.primaryMuscleGroup) next.primaryMuscleGroup = existing.primaryMuscleGroup;
    if (existing.secondaryMuscleGroup) next.secondaryMuscleGroup = existing.secondaryMuscleGroup;
    if (existing.targetArea) next.targetArea = existing.targetArea;
    if (Array.isArray(existing.secondaryMuscleGroups) && existing.secondaryMuscleGroups.length) {
      next.secondaryMuscleGroups = existing.secondaryMuscleGroups.slice();
    }
    if (existing.tips) next.tips = existing.tips;
    if (existing.commonMistakes) next.commonMistakes = existing.commonMistakes;
    var instructionImages = pickInstructionImagesFields(existing, defaults);
    if (instructionImages.length) next.instructionImages = instructionImages;
    return next;
  }

  function isWorkoutBBackShoulderSix(exercises) {
    if (!exercises || exercises.length !== 6) return false;
    var tailIds = ['b-rope-pull-to-belly', 'b-rope-pull-to-chest', 'b-incline-y-raise', 'b-dumbbell-6-way-raise'];
    if (exercises[0].id !== 'b-lat-pulldown' || exercises[1].id !== 'b-seated-cable-row') return false;
    var i;
    for (i = 0; i < 4; i += 1) {
      if (exercises[2 + i].id !== tailIds[i]) return false;
    }
    return true;
  }

  function exerciseContentMatches(exercise, defaults) {
    var a = clone(exercise);
    var b = clone(defaults);
    ['image', 'imageId', 'primaryMuscleGroup', 'secondaryMuscleGroup', 'targetArea', 'secondaryMuscleGroups', 'tips', 'commonMistakes', 'instructionImages'].forEach(function (key) {
      delete a[key];
      delete b[key];
    });
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // T4: keep Lat Pulldown + Seated Cable Row; replace bài 3–6 with Lưng + Vai program.
  function migrateWorkoutBBackShoulderSix(workouts) {
    if (!workouts || !workouts.b || !Array.isArray(workouts.b.exercises)) {
      return { workouts: workouts, changed: false };
    }
    var exercises = workouts.b.exercises;
    var tailDefaults = defaultWorkoutBExercisesTail();
    var title = '💪 Lưng + Vai';
    var changed = false;

    if (workouts.b.title !== title) {
      workouts.b.title = title;
      changed = true;
    }

    var head0 =
      exercises[0] && exercises[0].id === 'b-lat-pulldown'
        ? exercises[0]
        : createExercise('b', ['Lat Pulldown', '3 × 10–12', 'Vừa', 'Kéo khuỷu tay xuống, không nhún vai.']);
    var head1 =
      exercises[1] && exercises[1].id === 'b-seated-cable-row'
        ? exercises[1]
        : createExercise('b', ['Seated Cable Row', '3 × 10–12', 'Vừa', 'Giữ ngực mở, kéo khuỷu tay về sau.']);

    if (exercises[0] !== head0 || exercises[1] !== head1) changed = true;

    var newTail = tailDefaults.map(function (def, idx) {
      return mergeTailExercisePreservingImage(exercises[2 + idx], def);
    });

    if (!isWorkoutBBackShoulderSix(exercises)) {
      changed = true;
    } else {
      var j;
      for (j = 2; j < 6; j += 1) {
        if (
          !exerciseContentMatches(exercises[j], tailDefaults[j - 2]) ||
          exercises[j].image !== newTail[j - 2].image ||
          exercises[j].imageId !== newTail[j - 2].imageId
        ) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      workouts.b.exercises = [head0, head1].concat(newTail);
    }
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
    var t4Result = migrateWorkoutBBackShoulderSix(workouts);
    workouts = t4Result.workouts;
    var imageResult = migrateExerciseAssetImages(workouts);
    workouts = imageResult.workouts;
    if (legCurlResult.changed || rdlResult.changed || t4Result.changed || imageResult.changed || !stored) {
      saveWorkouts(workouts);
    }
    return workouts;
  }

  function saveWorkouts(workouts) {
    var payload = stripHeavyExerciseImages(workouts);
    if (writeJson(STORAGE_KEYS.workouts, payload)) return true;
    return writeJson(STORAGE_KEYS.workouts, stripHeavyExerciseImages(payload));
  }

  var LEGACY_HISTORY_KEYS = ['myfit-history-v2', 'myfit-history-v1', 'myfit-history'];

  function migrateHistoryEntry(entry) {
    if (!entry || !Array.isArray(entry.exercises)) return entry;
    entry.exercises = entry.exercises.map(function (item, index) {
      var next = ensureSetLogs(clone(item));
      if (next.role !== 'supplemental' && next.scheduledOrder == null) {
        next.scheduledOrder = index + 1;
      }
      if (next.actualOrder == null && next.completionStatus === 'completed') {
        next.actualOrder = index + 1;
      }
      return next;
    });
    entry.exercises.sort(function (a, b) {
      var ao = a.actualOrder != null ? a.actualOrder : 9999;
      var bo = b.actualOrder != null ? b.actualOrder : 9999;
      if (ao !== bo) return ao - bo;
      var so = (a.scheduledOrder || 9999) - (b.scheduledOrder || 9999);
      return so;
    });
    return entry;
  }

  function loadHistory() {
    var history = readJson(STORAGE_KEYS.history, null);
    if (!Array.isArray(history)) {
      history = [];
      LEGACY_HISTORY_KEYS.some(function (key) {
        if (key === STORAGE_KEYS.history) return false;
        var legacy = readJson(key, null);
        if (Array.isArray(legacy) && legacy.length) {
          history = legacy;
          return true;
        }
        return false;
      });
    }
    history = history.map(migrateHistoryEntry);
    saveHistory(history);
    return history;
  }

  function saveHistory(history) {
    writeJson(STORAGE_KEYS.history, Array.isArray(history) ? history : []);
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
    if (exercise.resistanceType === 'band' || exercise.resistanceType === 'bodyweight') return 'Band';
    if (!exercise.resistance) return '0 kg';
    return exercise.resistance + ' kg';
  }

  function formatExerciseMeta(exercise) {
    var reps = exercise.repsRange || exercise.reps;
    return exercise.sets + ' × ' + reps + ' · ' + formatResistance(exercise);
  }

  function formatResistanceTypeLabel(type) {
    if (type === 'kg') return 'kg (tạ/máy)';
    if (type === 'band') return 'Band / dây kháng lực';
    if (type === 'bodyweight') return 'Bodyweight / tự trọng';
    return type || '—';
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
      resistanceType: exercise.resistanceType,
      primaryMuscleGroup: exercise.primaryMuscleGroup || '',
      secondaryMuscleGroup: exercise.secondaryMuscleGroup || '',
      targetArea: exercise.targetArea || '',
      secondaryMuscleGroups: Array.isArray(exercise.secondaryMuscleGroups)
        ? exercise.secondaryMuscleGroups.slice()
        : [],
      tips: exercise.tips || '',
      commonMistakes: exercise.commonMistakes || '',
      instructionImages: normalizeInstructionImages(exercise.instructionImages)
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
    var label = 'SET ' + (log.setNumber || '?') + ' — ';
    if (log.resistanceType === 'band' || log.resistanceType === 'bodyweight') return label + 'Band';
    return label + (log.resistance != null ? log.resistance : 0) + ' kg';
  }

  function getExerciseLoadHistory(exerciseId, identityKey) {
    var history = loadHistory();
    var rows = [];
    history.forEach(function (entry) {
      (entry.exercises || []).forEach(function (item) {
        var snap = item.snapshot || {};
        var key = exerciseIdentityKey(snap);
        if (snap.id !== exerciseId && key !== identityKey) return;
        var logs = (item.setLogs || []).filter(function (log) { return log.completed; });
        if (!logs.length) return;
        rows.push({
          date: entry.date,
          dateLabel: formatDateVi(entry.date),
          logs: logs.slice()
        });
      });
    });
    return rows;
  }

  function createSessionExercise(exercise, role, scheduledOrder) {
    var snap = snapshotExercise(exercise);
    return {
      exerciseId: snap.id,
      snapshot: snap,
      role: role === 'supplemental' ? 'supplemental' : 'scheduled',
      scheduledOrder: role === 'supplemental' ? null : (scheduledOrder != null ? scheduledOrder : null),
      actualOrder: null,
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

  function ensureSessionExerciseShape(item, index) {
    if (!item || typeof item !== 'object') return item;
    ensureSetLogs(item);
    if (item.role !== 'supplemental' && item.scheduledOrder == null) {
      item.scheduledOrder = index + 1;
    }
    return item;
  }

  function getNextActualOrder(session) {
    var max = 0;
    (session.exercises || []).forEach(function (item) {
      if (item.actualOrder != null && item.actualOrder > max) max = item.actualOrder;
    });
    return max + 1;
  }

  function assignActualOrder(session, item) {
    if (!session || !item || item.actualOrder != null) return;
    item.actualOrder = getNextActualOrder(session);
  }

  function findNextDefaultExerciseIndex(session) {
    var scheduled = findIncompleteScheduledIndex(session);
    if (scheduled >= 0) return scheduled;
    var i;
    for (i = 0; i < (session.exercises || []).length; i += 1) {
      if (session.exercises[i].completionStatus !== 'completed') return i;
    }
    return -1;
  }

  function findIncompleteScheduledIndex(session) {
    var best = -1;
    var bestOrder = Infinity;
    (session.exercises || []).forEach(function (item, index) {
      if (item.role === 'supplemental') return;
      if (item.completionStatus === 'completed') return;
      var order = item.scheduledOrder != null ? item.scheduledOrder : index + 1;
      if (order < bestOrder) {
        bestOrder = order;
        best = index;
      }
    });
    return best;
  }

  function hasIncompleteExercises(session) {
    return (session.exercises || []).some(function (item) {
      return item.completionStatus !== 'completed';
    });
  }

  function findSessionExerciseIndex(session, exercise) {
    if (!session || !exercise) return -1;
    var id = exercise.id;
    var key = exerciseIdentityKey(exercise);
    var i;
    for (i = 0; i < (session.exercises || []).length; i += 1) {
      var item = session.exercises[i];
      var snap = item.snapshot || {};
      if (snap.id === id || exerciseIdentityKey(snap) === key) return i;
    }
    return -1;
  }

  function sortExercisesByActualOrder(exercises) {
    return (exercises || []).slice().sort(function (a, b) {
      var ao = a.actualOrder != null ? a.actualOrder : 9999;
      var bo = b.actualOrder != null ? b.actualOrder : 9999;
      if (ao !== bo) return ao - bo;
      return (a.scheduledOrder || 9999) - (b.scheduledOrder || 9999);
    });
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
      actualOrderCounter: 0,
      exercises: exercises.map(function (exercise, index) {
        return createSessionExercise(
          exercise,
          options.roleFor && options.roleFor(exercise) || role,
          index + 1
        );
      })
    };
  }

  function finalizeHistoryEntry(session) {
    var end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
    var start = new Date(session.startTime).getTime();
    var exercises = (session.exercises || []).map(function (item, index) {
      var next = clone(ensureSessionExerciseShape(item, index));
      if (next.completionStatus === 'completed' && next.actualOrder == null) {
        assignActualOrder(session, next);
      }
      return next;
    });
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
      exercises: sortExercisesByActualOrder(exercises)
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
      resistanceType: 'band',
      primaryMuscleGroup: 'glutes',
      secondaryMuscleGroup: 'gluteus_maximus'
    }),
    createLibraryExercise('Banded Abduction', {
      image: 'assets/exercises/banded-abduction.jpg',
      instructions: 'Mở gối chậm, giữ căng dây.',
      sets: 3,
      reps: 20,
      resistanceType: 'band',
      primaryMuscleGroup: 'glutes',
      secondaryMuscleGroup: 'gluteus_medius'
    }),
    createLibraryExercise('Lateral Raise', {
      image: 'assets/exercises/lateral-raise.jpg',
      instructions: 'Nâng đến khoảng ngang vai, không vung tạ.',
      sets: 3,
      reps: 15,
      resistance: 2,
      resistanceType: 'kg',
      primaryMuscleGroup: 'shoulders',
      secondaryMuscleGroup: 'side_delts'
    }),
    createLibraryExercise('Face Pull', {
      image: 'assets/exercises/face-pull.jpg',
      instructions: 'Kéo cáp về phía mặt, khuỷu tay cao, siết lưng trên.',
      sets: 3,
      reps: 12,
      resistanceType: 'band',
      primaryMuscleGroup: 'back',
      secondaryMuscleGroup: 'trap_middle'
    }),
    createLibraryExercise('Calf Raise', {
      image: 'assets/exercises/calf-raise.jpg',
      instructions: 'Nhón gót có kiểm soát, dừng nhẹ ở đỉnh rồi hạ chậm.',
      sets: 3,
      reps: 15,
      resistanceType: 'bodyweight',
      primaryMuscleGroup: 'calves',
      secondaryMuscleGroup: 'gastrocnemius'
    })
  ];

  function normalizeLibraryExercise(exercise) {
    return normalizeExercise(exercise, 'lib');
  }

  function loadLibrary(workouts) {
    var stored = readJson(STORAGE_KEYS.library, null);
    if (!stored || !Array.isArray(stored.exercises)) {
      stored = { exercises: clone(DEFAULT_LIBRARY) };
    }
    stored.exercises = stored.exercises.map(normalizeLibraryExercise);
    var byId = {};
    stored.exercises.forEach(function (ex) { byId[ex.id] = true; });
    var seedChanged = false;
    DEFAULT_LIBRARY.forEach(function (seed) {
      if (!byId[seed.id]) {
        stored.exercises.push(clone(seed));
        seedChanged = true;
      }
    });
    if (workouts) {
      var synced = syncLibraryFromWorkouts(workouts, stored);
      stored = synced.library;
      if (synced.changed || seedChanged) writeJson(STORAGE_KEYS.library, stored);
      return stored;
    }
    if (seedChanged) writeJson(STORAGE_KEYS.library, stored);
    return stored;
  }

  function saveLibrary(library) {
    var payload = clone(library);
    if (payload && Array.isArray(payload.exercises)) {
      payload.exercises.forEach(stripHeavyExerciseRecord);
    }
    writeJson(STORAGE_KEYS.library, payload);
  }

  function migrateActiveSessionShape(session) {
    if (!session || !Array.isArray(session.exercises)) return session;
    if (!session.sessionKind) session.sessionKind = session.workoutId === 'library' ? 'library' : 'schedule';
    session.exercises = session.exercises.map(function (item, index) {
      return ensureSessionExerciseShape(item, index);
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
    MUSCLE_GROUPS: MUSCLE_GROUPS,
    MUSCLE_GROUP_CONFIG: MUSCLE_GROUP_CONFIG,
    getPrimaryMuscleConfig: getPrimaryMuscleConfig,
    getSubgroupsForPrimary: getSubgroupsForPrimary,
    findSubgroupDef: findSubgroupDef,
    muscleClassificationLabel: muscleClassificationLabel,
    resolveMuscleFormLevels: resolveMuscleFormLevels,
    getMuscleDisplayParts: getMuscleDisplayParts,
    createMuscleFilterState: createMuscleFilterState,
    cloneMuscleFilterState: cloneMuscleFilterState,
    resetMuscleFilterLevel: resetMuscleFilterLevel,
    getMuscleFilterBreadcrumb: getMuscleFilterBreadcrumb,
    getMuscleFilterSublevelOptions: getMuscleFilterSublevelOptions,
    exerciseMatchesMuscleFilter: exerciseMatchesMuscleFilter,
    filterExercisesByMuscle: filterExercisesByMuscle,
    INSTRUCTION_IMAGE_TYPES: INSTRUCTION_IMAGE_TYPES,
    muscleGroupLabel: muscleGroupLabel,
    instructionImageTypeLabel: instructionImageTypeLabel,
    normalizeInstructionImages: normalizeInstructionImages,
    normalizeExercise: normalizeExercise,
    WELCOME_BACKGROUND_IMAGE: WELCOME_BACKGROUND_IMAGE,
    DEFAULT_WORKOUTS: DEFAULT_WORKOUTS,
    EXERCISE_IMAGE_ASSETS: EXERCISE_IMAGE_ASSETS,
    catalogImageForExercise: catalogImageForExercise,
    hasCustomExerciseImage: hasCustomExerciseImage,
    isDefaultCatalogImage: isDefaultCatalogImage,
    pickExerciseImageFields: pickExerciseImageFields,
    pickInstructionImagesFields: pickInstructionImagesFields,
    mergeExerciseMaster: mergeExerciseMaster,
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
    formatResistanceTypeLabel: formatResistanceTypeLabel,
    formatExerciseMeta: formatExerciseMeta,
    estimateWorkoutSeconds: estimateWorkoutSeconds,
    formatDuration: formatDuration,
    formatClockDuration: formatClockDuration,
    snapshotExercise: snapshotExercise,
    createSessionExercise: createSessionExercise,
    ensureSessionExerciseShape: ensureSessionExerciseShape,
    assignActualOrder: assignActualOrder,
    findIncompleteScheduledIndex: findIncompleteScheduledIndex,
    findNextDefaultExerciseIndex: findNextDefaultExerciseIndex,
    hasIncompleteExercises: hasIncompleteExercises,
    findSessionExerciseIndex: findSessionExerciseIndex,
    sortExercisesByActualOrder: sortExercisesByActualOrder,
    createWorkoutSession: createWorkoutSession,
    finalizeHistoryEntry: finalizeHistoryEntry,
    createSetLogs: createSetLogs,
    ensureSetLogs: ensureSetLogs,
    formatSetLogLine: formatSetLogLine,
    getExerciseLoadHistory: getExerciseLoadHistory,
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
    exerciseIdentityKey: exerciseIdentityKey,
    syncLibraryFromWorkouts: syncLibraryFromWorkouts,
    propagateExerciseMaster: propagateExerciseMaster,
    workoutHasExerciseIdentity: workoutHasExerciseIdentity,
    applyMasterFields: applyMasterFields,
    formatTime: formatTime,
    formatDateVi: formatDateVi,
    completionStatusLabel: completionStatusLabel,
    summarizeHistoryEntry: summarizeHistoryEntry
  };
})();
