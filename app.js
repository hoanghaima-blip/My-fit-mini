(function () {
  'use strict';

  var D = window.MyFitData;
  var Img = window.MyFitImages;
  var workouts = D.loadWorkouts();
  var library = D.loadLibrary(workouts);
  var currentWorkoutId = D.loadLastDay() || 'a';
  var selectedExerciseIndex = 0;
  var selectedLibraryIndex = -1;
  var pickMode = ''; // 'session' | 'library-detail'
  var pickJumpAfterInsert = false;
  var activeSession = D.loadActiveSession();
  var restTimerId = null;
  var resumePromptShown = false;
  var formImageState = {
    edit: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' },
    replace: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' },
    add: { pendingFile: null, clearImage: false, existingImageId: '', existingImage: '', previewUrl: '' }
  };
  var formInstructionImagesState = {
    edit: [],
    replace: [],
    add: []
  };
  var instructionPendingPromises = {
    edit: [],
    replace: [],
    add: []
  };
  var instructionLoadPromises = {
    edit: null,
    replace: null,
    add: null
  };
  var formEditSource = {
    edit: null,
    replace: null,
    add: null
  };
  var formMediaDirty = {
    edit: { image: false, instructionImages: false },
    replace: { image: false, instructionImages: false },
    add: { image: false, instructionImages: false }
  };
  var instructionDragIndex = null;
  var detailContext = { mode: 'schedule', libraryIndex: -1, libraryExerciseId: '' };
  var editingLibraryIndex = -1;
  var libraryMuscleFilter = D.createMuscleFilterState();
  var pickMuscleFilter = D.createMuscleFilterState();

  function isImageDebugEnabled() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search.indexOf('myfit_debug=image') >= 0) {
        return true;
      }
      return localStorage.getItem('myfit-image-debug') === '1';
    } catch (err) {
      return false;
    }
  }

  function imageDebug() {
    if (!isImageDebugEnabled()) return;
    var args = ['[IMAGE DEBUG]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function showFormError(message) {
    if (!message) return;
    var toast = document.getElementById('form-error-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'form-error-toast';
      toast.className = 'form-error-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showFormError._timer);
    showFormError._timer = setTimeout(function () {
      toast.hidden = true;
    }, 5000);
  }

  var els = {
    welcomeScreen: document.getElementById('welcome-screen'),
    welcomeBg: document.getElementById('welcome-bg'),
    appHome: document.getElementById('app-home'),
    libraryScreen: document.getElementById('library-screen'),
    libraryList: document.getElementById('library-list'),
    libraryMuscleFilter: document.getElementById('library-muscle-filter'),
    librarySearch: document.getElementById('library-search'),
    title: document.getElementById('hero-title'),
    meta: document.getElementById('hero-meta'),
    list: document.getElementById('exercise-list'),
    historyList: document.getElementById('history-list'),
    week: document.getElementById('week-calendar'),
    resumeBanner: document.getElementById('resume-banner'),
    detailOverlay: document.getElementById('detail-overlay'),
    dprog: document.getElementById('dprog'),
    dname: document.getElementById('dname'),
    dprimaryMuscle: document.getElementById('dprimary-muscle'),
    dsecondaryMuscles: document.getElementById('dsecondary-muscles'),
    dinstructionsLabel: document.getElementById('dinstructions-label'),
    dnoteWrap: document.getElementById('dnote-wrap'),
    dthumbnailWrap: document.getElementById('dthumbnail-wrap'),
    dsets: document.getElementById('dsets'),
    dresistance: document.getElementById('dresistance'),
    dresistanceType: document.getElementById('dresistance-type'),
    detailEditBtn: document.getElementById('detail-edit-btn'),
    detailStartBtn: document.getElementById('detail-start-btn'),
    dmeta: document.getElementById('dmeta'),
    dmuscles: document.getElementById('dmuscles'),
    dnote: document.getElementById('dnote'),
    dimage: document.getElementById('dimage'),
    dinstructions: document.getElementById('dinstructions'),
    dtips: document.getElementById('dtips'),
    dcommonMistakes: document.getElementById('dcommon-mistakes'),
    dinstructionGallery: document.getElementById('dinstruction-gallery'),
    workoutOverlay: document.getElementById('workout-overlay'),
    wprog: document.getElementById('wprog'),
    wname: document.getElementById('wname'),
    wmeta: document.getElementById('wmeta'),
    wset: document.getElementById('wset'),
    wimage: document.getElementById('wimage'),
    wsetDisplay: document.getElementById('wset-display'),
    wrepsDisplay: document.getElementById('wreps-display'),
    wSetResistance: document.getElementById('w-set-resistance'),
    wSetResistanceType: document.getElementById('w-set-resistance-type'),
    restOverlay: document.getElementById('rest-overlay'),
    restLabel: document.getElementById('rest-label'),
    restTimer: document.getElementById('rest-timer'),
    completionOverlay: document.getElementById('completion-overlay'),
    completionStats: document.getElementById('completion-stats'),
    editOverlay: document.getElementById('edit-overlay'),
    replaceOverlay: document.getElementById('replace-overlay'),
    addExerciseOverlay: document.getElementById('add-exercise-overlay'),
    pickExerciseOverlay: document.getElementById('pick-exercise-overlay'),
    pickExerciseList: document.getElementById('pick-exercise-list'),
    pickMuscleFilter: document.getElementById('pick-muscle-filter'),
    pickExerciseSearch: document.getElementById('pick-exercise-search'),
    pickExerciseTitle: document.getElementById('pick-exercise-title'),
    pickExerciseIntro: document.getElementById('pick-exercise-intro'),
    addToScheduleOverlay: document.getElementById('add-to-schedule-overlay'),
    editForm: document.getElementById('edit-form'),
    replaceForm: document.getElementById('replace-form'),
    addExerciseForm: document.getElementById('add-exercise-form'),
    historyDetailOverlay: document.getElementById('history-detail-overlay'),
    historyDetailContent: document.getElementById('history-detail-content'),
    workoutPickBtn: document.getElementById('workout-pick-exercise-btn'),
    restPickBtn: document.getElementById('rest-pick-exercise-btn'),
    restSkipBtn: document.getElementById('rest-skip-btn'),
    resistanceHistoryBtn: document.getElementById('w-resistance-history-btn'),
    resistanceHistoryOverlay: document.getElementById('resistance-history-overlay'),
    resistanceHistoryContent: document.getElementById('resistance-history-content'),
    resistanceHistoryTitle: document.getElementById('resistance-history-title')
  };

  function persistLibrary() {
    D.saveLibrary(library);
  }

  function getDisplayedExercises() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return [];
    return D.getOrderedWorkoutExercises(workout);
  }

  function getWorkout(workoutId) {
    return workouts[workoutId];
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hideOverlay(el) {
    if (el) el.style.display = 'none';
  }

  function showOverlay(el, mode) {
    if (!el) return;
    el.style.display = mode || 'flex';
  }

  function persistWorkouts() {
    var saved = D.saveWorkouts(workouts);
    syncExerciseCatalog();
    return saved;
  }

  function syncExerciseCatalog() {
    var synced = D.syncLibraryFromWorkouts(workouts, library);
    library = synced.library;
    if (synced.changed) D.saveLibrary(library);
  }

  function applyMasterExerciseUpdate(exercise) {
    var result = D.propagateExerciseMaster(exercise, workouts, library);
    workouts = result.workouts;
    library = result.library;
    if (result.changed) {
      D.saveWorkouts(workouts);
      D.saveLibrary(library);
    }
  }

  function isExternalImageUrl(value) {
    var url = String(value || '').trim();
    return /^https?:\/\//i.test(url) || /^data:/i.test(url);
  }

  function markInstructionImagesDirty(form) {
    formMediaDirty[getFormMode(form)].instructionImages = true;
  }

  function markPrimaryImageDirty(form) {
    formMediaDirty[getFormMode(form)].image = true;
  }

  function resetFormMediaDirty(mode) {
    formMediaDirty[mode] = { image: false, instructionImages: false };
  }

  function getFreshWorkoutExercise(exerciseId) {
    var workout = getWorkout(currentWorkoutId);
    if (!workout || !Array.isArray(workout.exercises) || !exerciseId) return null;
    for (var i = 0; i < workout.exercises.length; i += 1) {
      if (workout.exercises[i] && workout.exercises[i].id === exerciseId) {
        return workout.exercises[i];
      }
    }
    return null;
  }

  function mergeExercisePreserveExisting(source, saved, form) {
    if (!source || !saved) return saved;
    var mode = getFormMode(form);
    var mediaDirty = formMediaDirty[mode] || { image: false, instructionImages: false };
    var state = formImageState[mode];

    if (!mediaDirty.image && !state.pendingFile && !state.clearImage) {
      var imageFields = D.pickExerciseImageFields(source, saved);
      saved.image = imageFields.image;
      saved.imageId = imageFields.imageId;
    }

    if (!mediaDirty.instructionImages) {
      saved.instructionImages = D.pickInstructionImagesFields(source, saved);
    }

    if (source.repsRange && saved.repsRange === undefined) {
      saved.repsRange = source.repsRange;
    }

    return saved;
  }

  function imageFieldDisplayValue(exercise) {
    var image = exercise && exercise.image ? String(exercise.image).trim() : '';
    if (!image) return '';
    if (D.isStableAssetPath(image)) return '';
    if (isExternalImageUrl(image)) return image;
    return image;
  }

  function persistSession() {
    D.saveActiveSession(activeSession);
  }

  function getCurrentExercise() {
    if (!activeSession) return null;
    return activeSession.exercises[activeSession.currentExerciseIndex] || null;
  }

  function setImageElement(imgEl, src) {
    if (!imgEl) return;
    if (src) {
      imgEl.onerror = function () {
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
      };
      imgEl.src = src;
      imgEl.style.display = 'block';
    } else {
      imgEl.removeAttribute('src');
      imgEl.style.display = 'none';
    }
  }

  function applyImageToElement(target, imageRef) {
    return Img.resolveImageSrc(imageRef).then(function (src) {
      setImageElement(target, src);
      return src;
    });
  }

  function renderHero() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    var exercises = getDisplayedExercises();
    var estimated = D.estimateWorkoutSeconds({ exercises: exercises });
    els.title.textContent = workout.title;
    els.meta.textContent = exercises.length + ' bài • khoảng ' + D.formatDuration(estimated);
    D.saveLastDay(currentWorkoutId);
  }

  function placeholderImageHtml(className) {
    return '<div class="' + className + ' placeholder" data-image-slot>🏋️</div>';
  }

  function renderList() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout || !els.list) return;
    var exercises = getDisplayedExercises();
    els.list.innerHTML = exercises.map(function (exercise, index) {
      var muscleHtml = formatMuscleTagsHtml(exercise);
      return (
        '<div class="card">' +
          '<div class="card-top">' +
            placeholderImageHtml('card-image') +
            '<div class="card-body">' +
              '<div class="name">' + (index + 1) + '. ' + escapeHtml(exercise.name) + '</div>' +
              (muscleHtml ? '<div class="muscle-tags">' + muscleHtml + '</div>' : '') +
              '<div class="meta">' + escapeHtml(D.formatExerciseMeta(exercise)) + '</div>' +
              '<span class="badge" data-action="detail" data-index="' + index + '">Xem hướng dẫn</span>' +
              (exercise.instructions ? '<div class="note">' + escapeHtml(exercise.instructions) + '</div>' : '') +
              (exercise.notes ? '<div class="note">' + escapeHtml(exercise.notes) + '</div>' : '') +
            '</div>' +
            '<div class="order-btns">' +
              '<button type="button" data-action="move-up" data-index="' + index + '" aria-label="Đưa lên">↑</button>' +
              '<button type="button" data-action="move-down" data-index="' + index + '" aria-label="Đưa xuống">↓</button>' +
            '</div>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button type="button" data-action="edit" data-index="' + index + '">Sửa</button>' +
            '<button type="button" data-action="replace" data-index="' + index + '">Thay bài</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    var cards = els.list.querySelectorAll('.card');
    exercises.forEach(function (exercise, index) {
      var slot = cards[index] && cards[index].querySelector('[data-image-slot]');
      if (!slot) return;
      Img.resolveImageSrc(exercise).then(function (src) {
        if (!src || !slot.parentNode) return;
        if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return;
        var img = document.createElement('img');
        img.className = 'card-image';
        img.alt = '';
        img.onerror = function () {
          if (img.parentNode) {
            var fallback = document.createElement('div');
            fallback.className = 'card-image placeholder';
            fallback.setAttribute('data-image-slot', '');
            fallback.textContent = '🏋️';
            img.replaceWith(fallback);
          }
        };
        img.src = src;
        slot.replaceWith(img);
      }).catch(function () {});
    });
  }

  function moveDisplayedExercise(index, direction) {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    var exercises = getDisplayedExercises();
    var target = index + direction;
    if (target < 0 || target >= exercises.length) return;
    var swapped = exercises.slice();
    var tmp = swapped[index];
    swapped[index] = swapped[target];
    swapped[target] = tmp;
    D.setDayOrder(currentWorkoutId, swapped.map(function (ex) { return ex.id; }));
    renderAll();
  }

  function saveDisplayedOrderAsDefault() {
    var workout = getWorkout(currentWorkoutId);
    if (!workout) return;
    var ordered = getDisplayedExercises();
    workout.exercises = ordered.slice();
    persistWorkouts();
    D.clearDayOrder(currentWorkoutId);
    renderAll();
  }
  function renderHistory() {
    if (!els.historyList) return;
    var history = D.loadHistory();
    if (!history.length) {
      els.historyList.innerHTML =
        '<div class="card history-empty-card">' +
          '<div class="name">Chưa có lịch sử</div>' +
          '<div class="note">Hoàn thành một buổi tập để xem tên buổi, thời gian dự kiến/thực tế và chi tiết từng bài tại đây.</div>' +
        '</div>';
      return;
    }
    els.historyList.innerHTML = history.map(function (entry, index) {
      var summary = D.summarizeHistoryEntry(entry);
      return (
        '<div class="card history-card" data-history-index="' + index + '">' +
          '<div class="name">' + escapeHtml(entry.workoutName) + '</div>' +
          '<div class="meta">' + escapeHtml(D.formatDateVi(entry.date)) + ' · ' +
            escapeHtml(D.formatTime(entry.startTime)) + ' – ' + escapeHtml(D.formatTime(entry.endTime)) +
          '</div>' +
          '<div class="history-row"><span>Thời gian dự kiến</span><strong>' + escapeHtml(D.formatClockDuration(entry.estimatedDuration)) + '</strong></div>' +
          '<div class="history-row"><span>Thời gian thực tế</span><strong>' + escapeHtml(D.formatClockDuration(entry.actualDuration)) + '</strong></div>' +
          '<div class="history-row"><span>Số bài</span><strong>' + summary.exerciseCount + '</strong></div>' +
          '<div class="history-row"><span>Set dự kiến</span><strong>' + summary.plannedSets + '</strong></div>' +
          '<div class="history-row"><span>Set thực tế</span><strong>' + summary.actualSets + '</strong></div>' +
          '<span class="badge">Xem chi tiết</span>' +
        '</div>'
      );
    }).join('');
  }

  function jumpToHistory() {
    var section = document.getElementById('history-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openHistoryDetail(index) {
    var history = D.loadHistory();
    var entry = history[index];
    if (!entry) return;
    var summary = D.summarizeHistoryEntry(entry);
    var html =
      '<div class="progress">Chi tiết buổi tập</div>' +
      '<h2>' + escapeHtml(entry.workoutName) + '</h2>' +
      '<div class="meta">' + escapeHtml(D.formatDateVi(entry.date)) + '</div>' +
      '<div class="history-row"><span>Bắt đầu</span><strong>' + escapeHtml(D.formatTime(entry.startTime)) + '</strong></div>' +
      '<div class="history-row"><span>Kết thúc</span><strong>' + escapeHtml(D.formatTime(entry.endTime)) + '</strong></div>' +
      '<div class="history-row"><span>Dự kiến</span><strong>' + escapeHtml(D.formatClockDuration(entry.estimatedDuration)) + '</strong></div>' +
      '<div class="history-row"><span>Thực tế</span><strong>' + escapeHtml(D.formatClockDuration(entry.actualDuration)) + '</strong></div>' +
      '<div class="history-row"><span>Bài tập</span><strong>' + summary.exerciseCount + '</strong></div>' +
      '<div class="history-row"><span>Sets planned / actual</span><strong>' + summary.plannedSets + ' / ' + summary.actualSets + '</strong></div>' +
      '<div class="history-detail-list">';

    (entry.exercises || []).slice().sort(function (a, b) {
      var ao = a.actualOrder != null ? a.actualOrder : 9999;
      var bo = b.actualOrder != null ? b.actualOrder : 9999;
      if (ao !== bo) return ao - bo;
      return (a.scheduledOrder || 9999) - (b.scheduledOrder || 9999);
    }).forEach(function (item, globalIndex) {
      var snap = item.snapshot || {};
      var status = item.completionStatus || 'pending';
      var roleBadge = item.role === 'supplemental' ? ' · Bổ sung' : '';
      var ensured = D.ensureSetLogs(D.clone(item));
      var setLines = (ensured.setLogs || []).filter(function (log) { return log.completed; });
      if (!setLines.length && (item.actualSetsCompleted || 0) > 0) {
        setLines = ensured.setLogs || [];
      }
      html +=
        '<div class="history-exercise" data-history-ex="' + globalIndex + '">' +
          placeholderImageHtml('card-image') +
          '<div class="name">' + escapeHtml(snap.name || 'Bài tập') + escapeHtml(roleBadge) + '</div>' +
          '<div class="meta">' + escapeHtml(D.formatExerciseMeta(snap)) + '</div>' +
          '<div class="meta">Set hoàn thành: ' + (item.actualSetsCompleted || 0) + '/' + (item.plannedSets || snap.sets || 0) + '</div>' +
          setLines.map(function (log) {
            return '<div class="set-log-line">' + escapeHtml(D.formatSetLogLine(log)) + '</div>';
          }).join('') +
          '<span class="status-pill ' + escapeHtml(status) + '">' + escapeHtml(D.completionStatusLabel(status)) + '</span>' +
        '</div>';
    });

    html += '</div>';
    els.historyDetailContent.innerHTML = html;
    showOverlay(els.historyDetailOverlay);

    entry.exercises.forEach(function (item, i) {
      var block = els.historyDetailContent.querySelector('[data-history-ex="' + i + '"]');
      var slot = block && block.querySelector('[data-image-slot]');
      if (!slot) return;
      Img.resolveImageSrc(item.snapshot || {}).then(function (src) {
        if (!src || !slot.parentNode) return;
        var img = document.createElement('img');
        img.className = 'card-image';
        img.alt = '';
        img.onerror = function () {
          if (img.parentNode) {
            var fallback = document.createElement('div');
            fallback.className = 'card-image placeholder';
            fallback.setAttribute('data-image-slot', '');
            fallback.textContent = '🏋️';
            img.replaceWith(fallback);
          }
        };
        img.src = src;
        slot.replaceWith(img);
      });
    });
  }
  function closeHistoryDetail() {
    hideOverlay(els.historyDetailOverlay);
  }

  function renderWeek() {
    var todayIndex = D.getTodayWeekIndex();
    els.week.innerHTML = D.WEEK_DAYS.map(function (day, index) {
      var classes = ['day'];
      if (index === todayIndex) classes.push('today');
      if (day.workoutId) classes.push('clickable');
      return (
        '<div class="' + classes.join(' ') + '" data-day-key="' + day.key + '" data-workout-id="' + (day.workoutId || '') + '">' +
          day.label + '<span>' + day.emoji + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.workoutId === currentWorkoutId);
    });
  }

  function renderAll() {
    renderHero();
    renderList();
    renderWeek();
    renderTabs();
    renderHistory();
    if (els.libraryScreen && !els.libraryScreen.hidden) renderLibrary();
  }

  function selectWorkout(workoutId) {
    if (!getWorkout(workoutId)) return;
    currentWorkoutId = workoutId;
    D.saveLastDay(workoutId);
    renderAll();
  }

  function formatDetailResistance(exercise) {
    if (exercise.resistanceType === 'band' || exercise.resistanceType === 'bodyweight') {
      return 'Band / tự trọng';
    }
    if (!exercise.resistance) return '0 kg';
    return exercise.resistance + ' kg';
  }

  function populateDetailView(exercise, options) {
    options = options || {};
    var isLibrary = options.mode === 'library';
    detailContext = {
      mode: isLibrary ? 'library' : 'schedule',
      libraryIndex: options.libraryIndex != null ? options.libraryIndex : -1
    };

    if (els.dprog) {
      if (isLibrary) {
        els.dprog.hidden = true;
        els.dprog.textContent = '';
      } else {
        els.dprog.hidden = false;
        els.dprog.textContent = 'Bài ' + (options.index + 1) + '/' + options.total;
      }
    }

    els.dname.textContent = exercise.name;

    if (els.dprimaryMuscle) {
      if (exercise.primaryMuscleGroup) {
        els.dprimaryMuscle.hidden = false;
        els.dprimaryMuscle.innerHTML =
          '<span class="detail-label">Nhóm cơ chính</span>' +
          '<span class="detail-value">' + escapeHtml(D.muscleGroupLabel(exercise.primaryMuscleGroup)) + '</span>';
      } else {
        els.dprimaryMuscle.hidden = true;
        els.dprimaryMuscle.innerHTML = '';
      }
    }

    if (els.dsecondaryMuscles) {
      var secondaryParts = [];
      if (exercise.secondaryMuscleGroup) {
        secondaryParts.push(D.muscleGroupLabel(exercise.secondaryMuscleGroup));
      }
      (exercise.secondaryMuscleGroups || []).forEach(function (id) {
        if (!id || id === exercise.primaryMuscleGroup || id === exercise.secondaryMuscleGroup) return;
        secondaryParts.push(D.muscleGroupLabel(id));
      });
      if (exercise.targetArea) secondaryParts.push(D.muscleGroupLabel(exercise.targetArea));
      if (secondaryParts.length) {
        els.dsecondaryMuscles.hidden = false;
        els.dsecondaryMuscles.innerHTML =
          '<span class="detail-label">Nhóm cơ phụ</span>' +
          '<span class="detail-value">' + escapeHtml(secondaryParts.join(' · ')) + '</span>';
      } else {
        els.dsecondaryMuscles.hidden = true;
        els.dsecondaryMuscles.innerHTML = '';
      }
    }

    var instructionsText = exercise.instructions || '';
    if (els.dinstructionsLabel) els.dinstructionsLabel.hidden = !instructionsText;
    els.dinstructions.textContent = instructionsText;
    els.dinstructions.hidden = !instructionsText;

    if (els.dtips) {
      if (exercise.tips) {
        els.dtips.hidden = false;
        els.dtips.textContent = 'Tip: ' + exercise.tips;
      } else {
        els.dtips.hidden = true;
        els.dtips.textContent = '';
      }
    }
    if (els.dcommonMistakes) {
      if (exercise.commonMistakes) {
        els.dcommonMistakes.hidden = false;
        els.dcommonMistakes.textContent = 'Lỗi thường gặp: ' + exercise.commonMistakes;
      } else {
        els.dcommonMistakes.hidden = true;
        els.dcommonMistakes.textContent = '';
      }
    }

    renderDetailInstructionGallery(exercise);

    var repsLabel = exercise.repsRange || exercise.reps;
    if (els.dsets) {
      els.dsets.innerHTML =
        '<span class="detail-label">Set / Reps</span>' +
        '<span class="detail-value">' + escapeHtml(String(exercise.sets) + ' × ' + String(repsLabel)) + '</span>';
    }
    if (els.dresistance) {
      els.dresistance.innerHTML =
        '<span class="detail-label">Mức kháng lực</span>' +
        '<span class="detail-value">' + escapeHtml(formatDetailResistance(exercise)) + '</span>';
    }
    if (els.dresistanceType) {
      els.dresistanceType.innerHTML =
        '<span class="detail-label">Loại kháng lực</span>' +
        '<span class="detail-value">' + escapeHtml(D.formatResistanceTypeLabel(exercise.resistanceType)) + '</span>';
    }

    if (els.dnoteWrap) {
      if (exercise.notes) {
        els.dnoteWrap.hidden = false;
        els.dnote.textContent = exercise.notes;
      } else {
        els.dnoteWrap.hidden = true;
        els.dnote.textContent = '';
      }
    }

    if (els.dthumbnailWrap && els.dimage) {
      Img.resolveImageSrc(exercise).then(function (src) {
        if (src && els.dthumbnailWrap) {
          els.dthumbnailWrap.hidden = false;
          els.dimage.src = src;
          els.dimage.style.display = 'block';
        } else if (els.dthumbnailWrap) {
          els.dthumbnailWrap.hidden = true;
          els.dimage.removeAttribute('src');
          els.dimage.style.display = 'none';
        }
      });
    }

    if (els.detailEditBtn) els.detailEditBtn.hidden = !isLibrary;
    if (els.detailStartBtn) {
      els.detailStartBtn.textContent = isLibrary ? 'Tập bài này' : 'Tập bài này';
    }
  }

  function openDetail(index) {
    selectedExerciseIndex = index;
    var displayed = getDisplayedExercises()[index];
    if (!displayed) return;
    var workout = getWorkout(currentWorkoutId);
    var exercise = displayed;
    if (workout && Array.isArray(workout.exercises)) {
      var fresh = workout.exercises.filter(function (ex) { return ex.id === displayed.id; })[0];
      if (fresh) exercise = fresh;
    }
    populateDetailView(exercise, {
      mode: 'schedule',
      index: index,
      total: getDisplayedExercises().length
    });
    showOverlay(els.detailOverlay);
  }

  function openLibraryEdit(index) {
    var stored = D.loadLibrary(workouts);
    library = stored;
    var exercise = stored.exercises[index];
    if (!exercise) return;
    editingLibraryIndex = index;
    detailContext.libraryExerciseId = exercise.id;
    var title = document.querySelector('#edit-overlay h2');
    if (title) title.textContent = 'Sửa bài thư viện';
    fillExerciseForm(els.editForm, exercise);
    showOverlay(els.editOverlay);
  }

  function closeDetail() {
    hideOverlay(els.detailOverlay);
  }

  function formatMuscleTagsHtml(exercise) {
    return D.getMuscleDisplayParts(exercise).map(function (part) {
      var cls = part.id === exercise.primaryMuscleGroup ? 'muscle-tag primary' : 'muscle-tag sub';
      return '<span class="' + cls + '">' + escapeHtml(part.label) + '</span>';
    }).join('');
  }

  function muscleFilterChipHtml(id, label, active, kind) {
    return (
      '<button type="button" class="muscle-filter-chip' + (active ? ' active' : '') + '" ' +
        'data-filter-kind="' + escapeHtml(kind || 'primary') + '" data-filter-id="' + escapeHtml(id || '') + '">' +
        escapeHtml(label) +
      '</button>'
    );
  }

  function renderMuscleFilterPanel(container, filterState, onChange) {
    if (!container) return;
    var mode = container.dataset.filterMode || 'library';
    var html = '';
    var crumbs = D.getMuscleFilterBreadcrumb(filterState);

    if (crumbs.length) {
      html += '<div class="muscle-filter-breadcrumb"><strong>Nhóm cơ:</strong> ';
      html += crumbs.map(function (crumb, index) {
        return (index ? '<span class="crumb-sep">›</span>' : '') + escapeHtml(crumb.label);
      }).join(' ');
      html += ' <button type="button" class="muscle-filter-reset" data-filter-reset="back">Tất cả</button></div>';
    }

    if (mode === 'pick') {
      html += '<select class="muscle-filter-select" data-filter-primary-select>';
      html += '<option value="">Tất cả nhóm cơ</option>';
      D.MUSCLE_GROUP_CONFIG.forEach(function (group) {
        html += '<option value="' + escapeHtml(group.id) + '"' +
          (filterState.primaryId === group.id ? ' selected' : '') + '>' +
          escapeHtml(group.label) + '</option>';
      });
      html += '</select>';
    } else {
      html += '<div class="muscle-filter-label">Nhóm cơ chính</div><div class="muscle-filter-row">';
      html += muscleFilterChipHtml('', 'Tất cả', !filterState.primaryId, 'primary');
      D.MUSCLE_GROUP_CONFIG.forEach(function (group) {
        html += muscleFilterChipHtml(group.id, group.label, filterState.primaryId === group.id, 'primary');
      });
      html += '</div>';
    }

    if (filterState.primaryId) {
      html += '<div class="muscle-filter-label">' + escapeHtml(D.muscleGroupLabel(filterState.primaryId)) + '</div>';
      html += '<div class="muscle-filter-row">';
      html += muscleFilterChipHtml('', 'Tất cả', !filterState.subgroupId, 'subgroup');
      D.getSubgroupsForPrimary(filterState.primaryId).forEach(function (sub) {
        var active = filterState.subgroupId === sub.id && !filterState.leafId;
        html += muscleFilterChipHtml(sub.id, sub.label, active, 'subgroup');
      });
      html += '</div>';

      if (filterState.subgroupId) {
        var leafOptions = D.getMuscleFilterSublevelOptions(filterState);
        if (leafOptions.length) {
          html += '<div class="muscle-filter-row">';
          html += muscleFilterChipHtml('', 'Tất cả', !filterState.leafId, 'leaf');
          leafOptions.forEach(function (leaf) {
            html += muscleFilterChipHtml(leaf.id, leaf.label, filterState.leafId === leaf.id, 'leaf');
          });
          html += '</div>';
        }
      }
    }

    container.innerHTML = html;

    if (!container.dataset.bound) {
      container.dataset.bound = '1';
      container.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-filter-id]');
        if (chip && chip.dataset.filterKind) {
          var kind = chip.dataset.filterKind;
          var id = chip.dataset.filterId || '';
          if (kind === 'primary') {
            filterState.primaryId = id;
            D.resetMuscleFilterLevel(filterState, id ? 'primary' : 'all');
          } else if (kind === 'subgroup') {
            filterState.subgroupId = id;
            D.resetMuscleFilterLevel(filterState, id ? 'subgroup' : 'primary');
          } else if (kind === 'leaf') {
            filterState.leafId = id;
          }
          if (onChange) onChange();
          return;
        }
        var resetBtn = event.target.closest('[data-filter-reset]');
        if (resetBtn) {
          D.resetMuscleFilterLevel(filterState, 'all');
          if (onChange) onChange();
        }
      });
      container.addEventListener('change', function (event) {
        var select = event.target.closest('[data-filter-primary-select]');
        if (!select) return;
        filterState.primaryId = select.value || '';
        D.resetMuscleFilterLevel(filterState, filterState.primaryId ? 'primary' : 'all');
        if (onChange) onChange();
      });
    }
  }

  function getFilteredLibraryExercises() {
    return D.filterExercisesByMuscle((library && library.exercises) || [], libraryMuscleFilter);
  }

  function getFilteredCatalogExercises() {
    return D.filterExercisesByMuscle(getExerciseCatalog(), pickMuscleFilter);
  }

  function renderDetailInstructionGallery(exercise) {
    if (!els.dinstructionGallery) return;
    var images = D.normalizeInstructionImages(exercise.instructionImages || []);
    if (!images.length) {
      els.dinstructionGallery.hidden = true;
      els.dinstructionGallery.innerHTML = '';
      return;
    }
    els.dinstructionGallery.hidden = false;
    els.dinstructionGallery.innerHTML = '<div class="detail-section-label">Ảnh hướng dẫn</div>';
    images.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'instruction-view-item';
      var img = document.createElement('img');
      img.alt = entry.label || '';
      img.loading = 'lazy';
      var meta = document.createElement('div');
      meta.className = 'instruction-view-meta';
      meta.innerHTML = '<strong>' + escapeHtml(D.instructionImageTypeLabel(entry.type)) + '</strong>' +
        (entry.label ? '<span>' + escapeHtml(entry.label) + '</span>' : '');
      item.appendChild(img);
      item.appendChild(meta);
      els.dinstructionGallery.appendChild(item);
      Img.resolveInstructionImageEntry(entry).then(function (src) {
        if (!src || !img.parentNode) return;
        img.src = src;
      });
    });
  }

  function findLibraryExerciseIndexById(exerciseId) {
    var exercises = (library && library.exercises) || [];
    for (var i = 0; i < exercises.length; i += 1) {
      if (exercises[i] && exercises[i].id === exerciseId) return i;
    }
    return -1;
  }

  function getLibraryExerciseById(exerciseId) {
    var stored = D.loadLibrary(workouts);
    var exercises = (stored && stored.exercises) || [];
    for (var i = 0; i < exercises.length; i += 1) {
      if (exercises[i] && exercises[i].id === exerciseId) return exercises[i];
    }
    return null;
  }

  function openLibraryDetail(index) {
    var stored = D.loadLibrary(workouts);
    library = stored;
    var exercise = stored.exercises[index];
    if (!exercise) return;
    detailContext.libraryExerciseId = exercise.id;
    populateDetailView(exercise, { mode: 'library', libraryIndex: index, libraryExerciseId: exercise.id });
    showOverlay(els.detailOverlay);
  }

  function populateSecondaryMuscleOptions(form, primaryId, selectedSecondary, selectedTarget, selectedLeaf) {
    var secondaryEl = form.querySelector('[data-role="secondary-muscle"]');
    var targetWrap = form.querySelector('[data-role="target-area-wrap"]');
    var targetEl = form.querySelector('[data-role="target-area"]');
    var leafWrap = form.querySelector('[data-role="muscle-leaf-wrap"]');
    var leafEl = form.querySelector('[data-role="muscle-leaf"]');
    if (!secondaryEl) return;
    secondaryEl.innerHTML = '<option value="">— Chọn nhóm cơ phụ —</option>';
    if (targetEl) targetEl.innerHTML = '<option value="">— Chọn vùng (tùy chọn) —</option>';
    if (leafEl) leafEl.innerHTML = '<option value="">— Chọn chi tiết —</option>';
    if (!primaryId) {
      secondaryEl.value = '';
      if (targetWrap) targetWrap.hidden = true;
      if (targetEl) targetEl.value = '';
      if (leafWrap) leafWrap.hidden = true;
      if (leafEl) leafEl.value = '';
      return;
    }
    D.getSubgroupsForPrimary(primaryId).forEach(function (sub) {
      var opt = document.createElement('option');
      opt.value = sub.id;
      opt.textContent = sub.label;
      secondaryEl.appendChild(opt);
    });
    secondaryEl.value = selectedSecondary || '';
    updateMuscleLeafOptions(form, primaryId, selectedSecondary || '', selectedLeaf || '');
    updateTargetAreaOptions(form, primaryId, selectedSecondary, selectedTarget);
  }

  function updateMuscleLeafOptions(form, primaryId, secondaryId, selectedLeaf) {
    var leafWrap = form.querySelector('[data-role="muscle-leaf-wrap"]');
    var leafEl = form.querySelector('[data-role="muscle-leaf"]');
    if (!leafWrap || !leafEl) return;
    leafEl.innerHTML = '<option value="">— Chọn chi tiết —</option>';
    var sub = D.findSubgroupDef(primaryId, secondaryId);
    if (!sub || !sub.children || !sub.children.length) {
      leafWrap.hidden = true;
      leafEl.value = '';
      return;
    }
    leafWrap.hidden = false;
    sub.children.forEach(function (child) {
      var opt = document.createElement('option');
      opt.value = child.id;
      opt.textContent = child.label;
      leafEl.appendChild(opt);
    });
    leafEl.value = selectedLeaf || '';
  }

  function updateTargetAreaOptions(form, primaryId, secondaryId, selectedTarget) {
    var targetWrap = form.querySelector('[data-role="target-area-wrap"]');
    var targetEl = form.querySelector('[data-role="target-area"]');
    if (!targetWrap || !targetEl) return;
    targetEl.innerHTML = '<option value="">— Chọn vùng (tùy chọn) —</option>';
    var sub = D.findSubgroupDef(primaryId, secondaryId);
    if (!sub || !sub.targetAreas || !sub.targetAreas.length) {
      targetWrap.hidden = true;
      targetEl.value = '';
      return;
    }
    targetWrap.hidden = false;
    sub.targetAreas.forEach(function (area) {
      var opt = document.createElement('option');
      opt.value = area.id;
      opt.textContent = area.label;
      targetEl.appendChild(opt);
    });
    targetEl.value = selectedTarget || '';
  }

  function bindMuscleFormCascade(form) {
    if (!form || form.dataset.muscleCascadeBound === '1') return;
    form.dataset.muscleCascadeBound = '1';
    var primaryEl = form.elements.primaryMuscleGroup;
    var secondaryEl = form.querySelector('[data-role="secondary-muscle"]');
    if (primaryEl) {
      primaryEl.addEventListener('change', function () {
        populateSecondaryMuscleOptions(form, primaryEl.value, '', '', '');
      });
    }
    if (secondaryEl) {
      secondaryEl.addEventListener('change', function () {
        var primaryId = primaryEl ? primaryEl.value : '';
        updateMuscleLeafOptions(form, primaryId, secondaryEl.value, '');
        updateTargetAreaOptions(form, primaryId, secondaryEl.value, '');
      });
    }
  }

  function populateMuscleGroupFields(form) {
    if (!form) return;
    var primary = form.querySelector('[data-role="primary-muscle"]');
    if (!primary || primary.dataset.populated === '1') return;
    D.MUSCLE_GROUP_CONFIG.forEach(function (group) {
      var opt = document.createElement('option');
      opt.value = group.id;
      opt.textContent = group.label;
      primary.appendChild(opt);
    });
    primary.dataset.populated = '1';
    bindMuscleFormCascade(form);
  }

  function readMuscleGroupsFromForm(form) {
    var primaryEl = form.elements.primaryMuscleGroup;
    var secondaryEl = form.querySelector('[data-role="secondary-muscle"]');
    var leafEl = form.querySelector('[data-role="muscle-leaf"]');
    var leafWrap = form.querySelector('[data-role="muscle-leaf-wrap"]');
    var targetEl = form.querySelector('[data-role="target-area"]');
    var secondaryValue = secondaryEl ? secondaryEl.value : '';
    var leafValue = leafEl && leafWrap && !leafWrap.hidden ? leafEl.value : '';
    return {
      primaryMuscleGroup: primaryEl ? primaryEl.value : '',
      secondaryMuscleGroup: leafValue || secondaryValue,
      targetArea: targetEl ? targetEl.value : '',
      secondaryMuscleGroups: []
    };
  }

  function fillMuscleGroupsInForm(form, exercise) {
    populateMuscleGroupFields(form);
    var levels = D.resolveMuscleFormLevels(exercise);
    var primaryEl = form.elements.primaryMuscleGroup;
    if (primaryEl) primaryEl.value = levels.primary;
    populateSecondaryMuscleOptions(
      form,
      levels.primary,
      levels.secondary,
      levels.targetArea,
      levels.leaf
    );
  }

  function resetInstructionImagesState(mode) {
    (formInstructionImagesState[mode] || []).forEach(function (item) {
      if (item.previewUrl && item.previewUrl.indexOf('blob:') === 0) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    formInstructionImagesState[mode] = [];
    instructionPendingPromises[mode] = [];
  }

  function awaitInstructionFormReady(form) {
    var mode = getFormMode(form);
    var pending = instructionPendingPromises[mode] || [];
    var waits = pending.slice();
    if (instructionLoadPromises[mode]) waits.push(instructionLoadPromises[mode]);
    if (!waits.length) return Promise.resolve();
    return Promise.all(waits).then(function () {
      instructionPendingPromises[mode] = [];
    });
  }

  function instructionTypeOptions(selected) {
    return D.INSTRUCTION_IMAGE_TYPES.map(function (type) {
      return '<option value="' + type.id + '"' + (type.id === selected ? ' selected' : '') + '>' +
        escapeHtml(type.label) + '</option>';
    }).join('');
  }

  function renderInstructionGallery(form) {
    var mode = getFormMode(form);
    var list = form.querySelector('[data-role="instruction-list"]');
    if (!list) return;
    var items = formInstructionImagesState[mode] || [];
    list.innerHTML = items.map(function (item, index) {
      return (
        '<div class="instruction-image-item" draggable="true" data-index="' + index + '">' +
          '<span class="instruction-drag" aria-hidden="true">⋮⋮</span>' +
          '<img src="' + escapeHtml(item.previewUrl || '') + '" alt="">' +
          '<div class="instruction-image-fields">' +
            '<select data-field="type">' + instructionTypeOptions(item.type || 'instruction') + '</select>' +
            '<input data-field="label" type="text" placeholder="Chú thích (tùy chọn)" value="' +
              escapeHtml(item.label || '') + '">' +
          '</div>' +
          '<button type="button" class="instruction-remove-btn" data-action="remove-instruction" data-index="' +
            index + '">×</button>' +
        '</div>'
      );
    }).join('');
  }

  function addInstructionImageFile(form, file) {
    markInstructionImagesDirty(form);
    var mode = getFormMode(form);
    var promise = Img.compressImageFile(file).catch(function () { return file; }).then(function (compressed) {
      formInstructionImagesState[mode].push({
        type: 'instruction',
        label: '',
        pendingFile: compressed,
        imageId: '',
        image: '',
        previewUrl: URL.createObjectURL(compressed)
      });
    });
    instructionPendingPromises[mode].push(promise);
    return promise;
  }

  function removeInstructionImage(form, index) {
    markInstructionImagesDirty(form);
    var mode = getFormMode(form);
    var item = formInstructionImagesState[mode][index];
    if (item && item.previewUrl && item.previewUrl.indexOf('blob:') === 0) {
      URL.revokeObjectURL(item.previewUrl);
    }
    formInstructionImagesState[mode].splice(index, 1);
    renderInstructionGallery(form);
  }

  function loadInstructionImagesIntoForm(form, images) {
    var mode = getFormMode(form);
    resetInstructionImagesState(mode);
    var normalized = D.normalizeInstructionImages(images || []);
    if (!normalized.length) {
      renderInstructionGallery(form);
      instructionLoadPromises[mode] = Promise.resolve();
      return instructionLoadPromises[mode];
    }
    instructionLoadPromises[mode] = Promise.all(normalized.map(function (entry) {
      return Img.resolveInstructionImageEntry(entry).then(function (src) {
        formInstructionImagesState[mode].push({
          type: entry.type || 'instruction',
          label: entry.label || '',
          pendingFile: null,
          imageId: entry.imageId || '',
          image: entry.image || '',
          previewUrl: src || ''
        });
      });
    })).then(function () {
      renderInstructionGallery(form);
    });
    return instructionLoadPromises[mode];
  }

  function uploadInstructionImages(items) {
    var result = [];
    var chain = Promise.resolve();
    items.forEach(function (item, index) {
      chain = chain.then(function () {
        var entry = {
          type: item.type || 'instruction',
          label: item.label || '',
          imageId: '',
          image: '',
          order: index
        };
        if (item.pendingFile) {
          return Img.putImage(item.pendingFile).then(function (imageId) {
            entry.imageId = imageId;
            result.push(entry);
          }).catch(function () {
            return readFileAsDataUrl(item.pendingFile).then(function (dataUrl) {
              if (dataUrl.length <= 180000) entry.image = dataUrl;
              if (entry.imageId || entry.image) result.push(entry);
            });
          });
        }
        entry.imageId = item.imageId || '';
        entry.image = item.image || '';
        if (entry.imageId || entry.image) result.push(entry);
        return null;
      });
    });
    return chain.then(function () { return result; });
  }

  function attachExerciseMetadata(form, base) {
    var fields = form.elements;
    var muscle = readMuscleGroupsFromForm(form);
    base.primaryMuscleGroup = muscle.primaryMuscleGroup;
    base.secondaryMuscleGroup = muscle.secondaryMuscleGroup;
    base.targetArea = muscle.targetArea;
    base.secondaryMuscleGroups = muscle.secondaryMuscleGroups || [];
    base.tips = fields.tips ? fields.tips.value : '';
    base.commonMistakes = fields.commonMistakes ? fields.commonMistakes.value : '';
    return base;
  }

  function finalizeExerciseFromForm(form, base, sourceExercise) {
    attachExerciseMetadata(form, base);
    var mode = getFormMode(form);
    return uploadInstructionImages(formInstructionImagesState[mode] || []).then(function (images) {
      base.instructionImages = images;
      return mergeExercisePreserveExisting(sourceExercise || formEditSource[mode], base, form);
    });
  }

  function chainFinalizeExerciseForm(form, promise, sourceExercise) {
    return promise.then(function (base) {
      return finalizeExerciseFromForm(form, base, sourceExercise);
    });
  }

  function bindInstructionGallery(form) {
    var fileInput = form.querySelector('[data-role="instruction-file"]');
    var list = form.querySelector('[data-role="instruction-list"]');
    if (fileInput && !fileInput.dataset.bound) {
      fileInput.dataset.bound = '1';
      fileInput.addEventListener('change', function () {
        var files = fileInput.files;
        if (!files || !files.length) return;
        var tasks = [];
        for (var i = 0; i < files.length; i += 1) {
          tasks.push(addInstructionImageFile(form, files[i]));
        }
        Promise.all(tasks).then(function () {
          fileInput.value = '';
          renderInstructionGallery(form);
        });
      });
    }
    if (list && !list.dataset.bound) {
      list.dataset.bound = '1';
      list.addEventListener('dragstart', function (event) {
        var item = event.target.closest('.instruction-image-item');
        if (!item) return;
        instructionDragIndex = parseInt(item.dataset.index, 10);
        item.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
      });
      list.addEventListener('dragend', function (event) {
        var item = event.target.closest('.instruction-image-item');
        if (item) item.classList.remove('dragging');
        instructionDragIndex = null;
      });
      list.addEventListener('dragover', function (event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });
      list.addEventListener('drop', function (event) {
        event.preventDefault();
        var item = event.target.closest('.instruction-image-item');
        if (!item || instructionDragIndex == null) return;
        var dropIndex = parseInt(item.dataset.index, 10);
        if (instructionDragIndex === dropIndex) return;
        markInstructionImagesDirty(form);
        var mode = getFormMode(form);
        var arr = formInstructionImagesState[mode];
        var moved = arr.splice(instructionDragIndex, 1)[0];
        arr.splice(dropIndex, 0, moved);
        instructionDragIndex = null;
        renderInstructionGallery(form);
      });
      list.addEventListener('click', function (event) {
        var removeBtn = event.target.closest('[data-action="remove-instruction"]');
        if (!removeBtn) return;
        removeInstructionImage(form, parseInt(removeBtn.dataset.index, 10));
      });
      list.addEventListener('change', function (event) {
        var target = event.target;
        if (!target.dataset.field) return;
        var itemEl = target.closest('.instruction-image-item');
        if (!itemEl) return;
        var idx = parseInt(itemEl.dataset.index, 10);
        var mode = getFormMode(form);
        var entry = formInstructionImagesState[mode][idx];
        if (!entry) return;
        if (target.dataset.field === 'type') entry.type = target.value;
        if (target.dataset.field === 'label') entry.label = target.value;
      });
    }
  }

  function getFormMode(form) {
    if (form === els.editForm) return 'edit';
    if (form === els.addExerciseForm) return 'add';
    return 'replace';
  }

  function getFormPreview(form) {
    return form.querySelector('[data-role="preview"]');
  }

  function resetFormImageState(mode) {
    var state = formImageState[mode];
    if (state.previewUrl && state.previewUrl.indexOf('blob:') === 0) {
      URL.revokeObjectURL(state.previewUrl);
    }
    formImageState[mode] = {
      pendingFile: null,
      clearImage: false,
      existingImageId: '',
      existingImage: '',
      previewUrl: ''
    };
  }

  function showFormPreview(form, src) {
    var preview = getFormPreview(form);
    if (!preview) return;
    if (src) {
      preview.src = src;
      preview.style.display = 'block';
    } else {
      preview.removeAttribute('src');
      preview.style.display = 'none';
    }
  }

  function bindImagePicker(form) {
    var pickBtn = form.querySelector('[data-role="pick"]');
    var clearBtn = form.querySelector('[data-role="clear"]');
    var fileInput = form.elements.imageFile;
    var urlInput = form.elements.image;
    if (pickBtn && fileInput && pickBtn.tagName === 'BUTTON') {
      pickBtn.addEventListener('click', function (event) {
        event.preventDefault();
        imageDebug('picker clicked (button)');
        fileInput.click();
      });
    } else if (pickBtn && fileInput) {
      pickBtn.addEventListener('click', function () {
        imageDebug('picker clicked (label)');
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var mode = getFormMode(form);
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        markPrimaryImageDirty(form);
        imageDebug('file selected', file.name, file.type, file.size);
        formImageState[mode].clearImage = false;
        if (urlInput) urlInput.value = '';
        Img.compressImageFile(file).then(function (compressed) {
          imageDebug('compressed', compressed.size || file.size, compressed.type || file.type);
          formImageState[mode].pendingFile = compressed;
          if (formImageState[mode].previewUrl && formImageState[mode].previewUrl.indexOf('blob:') === 0) {
            URL.revokeObjectURL(formImageState[mode].previewUrl);
          }
          var previewUrl = URL.createObjectURL(compressed);
        formImageState[mode].previewUrl = previewUrl;
        showFormPreview(form, previewUrl);
        imageDebug('preview generated', previewUrl.slice(0, 40));
      }).catch(function (err) {
          imageDebug('compress failed, using original', err);
          formImageState[mode].pendingFile = file;
          if (formImageState[mode].previewUrl && formImageState[mode].previewUrl.indexOf('blob:') === 0) {
            URL.revokeObjectURL(formImageState[mode].previewUrl);
          }
          var previewUrl = URL.createObjectURL(file);
          formImageState[mode].previewUrl = previewUrl;
          showFormPreview(form, previewUrl);
        });
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        markPrimaryImageDirty(form);
        var mode = getFormMode(form);
        formImageState[mode].pendingFile = null;
        formImageState[mode].clearImage = true;
        formImageState[mode].existingImageId = '';
        formImageState[mode].existingImage = '';
        urlInput.value = '';
        if (fileInput) fileInput.value = '';
        showFormPreview(form, '');
      });
    }
    if (urlInput) {
      urlInput.addEventListener('input', function () {
        var mode = getFormMode(form);
        if (!urlInput.value.trim()) return;
        markPrimaryImageDirty(form);
        formImageState[mode].pendingFile = null;
        formImageState[mode].clearImage = false;
        formImageState[mode].existingImageId = '';
        showFormPreview(form, urlInput.value.trim());
      });
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('read failed')); };
      reader.readAsDataURL(file);
    });
  }

  function readExerciseForm(form, existingId, workoutId, sourceExercise) {
    return awaitInstructionFormReady(form).then(function () {
      return readExerciseFormCore(form, existingId, workoutId, sourceExercise);
    });
  }

  function readExerciseFormCore(form, existingId, workoutId, sourceExercise) {
    var mode = getFormMode(form);
    var state = formImageState[mode];
    var mediaDirty = formMediaDirty[mode] || { image: false, instructionImages: false };
    var fields = form.elements;
    var id = existingId || (sourceExercise && sourceExercise.id) || D.makeExerciseId(workoutId, fields.name.value.trim());
    var base = sourceExercise ? D.clone(sourceExercise) : {
      id: id,
      image: '',
      imageId: '',
      instructions: '',
      notes: '',
      sets: 3,
      reps: 10,
      resistance: 0,
      resistanceType: 'kg'
    };
    base.id = id;
    base.name = fields.name.value;
    base.instructions = fields.instructions.value;
    base.notes = fields.notes.value;
    base.sets = Math.max(1, parseInt(fields.sets.value, 10) || 1);
    base.reps = Math.max(1, parseInt(fields.reps.value, 10) || 1);
    base.resistance = Math.max(0, parseFloat(fields.resistance.value) || 0);
    base.resistanceType = fields.resistanceType.value;
    if (base.image === undefined) base.image = '';
    if (base.imageId === undefined) base.imageId = '';

    if (state.pendingFile) {
      imageDebug('save started', state.pendingFile.size, state.pendingFile.type);
      return chainFinalizeExerciseForm(form, Img.putImage(state.pendingFile).then(function (imageId) {
        base.imageId = imageId;
        base.image = '';
        imageDebug('save completed', { exerciseId: base.id, imageId: imageId, image: '' });
        return base;
      }).catch(function (err) {
        imageDebug('putImage failed', err);
        return readFileAsDataUrl(state.pendingFile).then(function (dataUrl) {
          if (dataUrl.length > 180000) {
            throw new Error('IMAGE_TOO_LARGE');
          }
          base.imageId = '';
          base.image = dataUrl;
          imageDebug('fallback small data URL', dataUrl.length);
          return base;
        });
      }), sourceExercise);
    }

    imageDebug('instructionImages pending count', (formInstructionImagesState[mode] || []).length);

    function finalizeExerciseImageFields(exercise) {
      if (exercise.imageId && !/^data:/i.test(String(exercise.image || ''))) {
        exercise.image = '';
      }
      return exercise;
    }

    if (state.clearImage) {
      base.image = '';
      base.imageId = '';
      return chainFinalizeExerciseForm(form, Promise.resolve(finalizeExerciseImageFields(base)), sourceExercise);
    }

    var url = fields.image.value.trim();
    if (url && mediaDirty.image) {
      base.image = url;
      base.imageId = '';
      return chainFinalizeExerciseForm(form, Promise.resolve(base), sourceExercise);
    }

    if (!mediaDirty.image && !state.pendingFile && !state.clearImage) {
      if (!base.image && !base.imageId && id) {
        var catalog = D.catalogImageForExercise({ id: id, name: base.name });
        if (catalog) base.image = catalog;
      }
    } else if (!base.image && !base.imageId && id) {
      var catalogFallback = D.catalogImageForExercise({ id: id, name: base.name });
      if (catalogFallback) base.image = catalogFallback;
    }
    return chainFinalizeExerciseForm(form, Promise.resolve(finalizeExerciseImageFields(base)), sourceExercise);
  }

  function fillExerciseForm(form, exercise) {
    var mode = getFormMode(form);
    var fields = form.elements;
    formEditSource[mode] = exercise ? D.clone(exercise) : null;
    resetFormMediaDirty(mode);
    resetFormImageState(mode);
    resetInstructionImagesState(mode);
    populateMuscleGroupFields(form);
    fillMuscleGroupsInForm(form, exercise);
    fields.name.value = exercise.name;
    fields.instructions.value = exercise.instructions || '';
    fields.notes.value = exercise.notes || '';
    if (fields.tips) fields.tips.value = exercise.tips || '';
    if (fields.commonMistakes) fields.commonMistakes.value = exercise.commonMistakes || '';
    fields.image.value = imageFieldDisplayValue(exercise);
    fields.sets.value = exercise.sets;
    fields.reps.value = exercise.reps;
    fields.resistance.value = exercise.resistance;
    fields.resistanceType.value = exercise.resistanceType;
    if (fields.imageFile) fields.imageFile.value = '';
    formImageState[mode].existingImageId = exercise.imageId || '';
    formImageState[mode].existingImage = exercise.image || '';
    Img.resolveImageSrc(exercise).then(function (src) {
      formImageState[mode].previewUrl = src;
      showFormPreview(form, src);
    });
    return loadInstructionImagesIntoForm(form, exercise.instructionImages);
  }

  function findWorkoutExerciseIndexByDisplayed(index) {
    var displayed = getDisplayedExercises()[index];
    var workout = getWorkout(currentWorkoutId);
    if (!displayed || !workout) return -1;
    return workout.exercises.findIndex(function (ex) { return ex.id === displayed.id; });
  }

  function openEdit(index) {
    editingLibraryIndex = -1;
    selectedExerciseIndex = index;
    var displayed = getDisplayedExercises()[index];
    if (!displayed) return;
    var exercise = getFreshWorkoutExercise(displayed.id) || displayed;
    var title = document.querySelector('#edit-overlay h2');
    if (title) title.textContent = 'Sửa bài tập';
    fillExerciseForm(els.editForm, exercise);
    showOverlay(els.editOverlay);
  }

  function closeEdit() {
    editingLibraryIndex = -1;
    hideOverlay(els.editOverlay);
  }

  function saveLibraryEdit(event) {
    event.preventDefault();
    if (editingLibraryIndex < 0) return;
    var existing = library.exercises[editingLibraryIndex];
    if (!existing) return;
    readExerciseForm(els.editForm, existing.id, 'lib', existing).then(function (exercise) {
      library.exercises[editingLibraryIndex] = exercise;
      applyMasterExerciseUpdate(exercise);
      persistLibrary();
      syncExerciseCatalog();
      resetFormImageState('edit');
      resetInstructionImagesState('edit');
      formEditSource.edit = null;
      resetFormMediaDirty('edit');
      var savedId = exercise.id;
      editingLibraryIndex = -1;
      closeEdit();
      library = D.loadLibrary(workouts);
      renderLibrary();
      if (detailContext.mode === 'library' && detailContext.libraryExerciseId === savedId) {
        var detailIndex = findLibraryExerciseIndexById(savedId);
        if (detailIndex >= 0) openLibraryDetail(detailIndex);
      }
    }).catch(function (err) {
      console.error('Failed to save library exercise', err);
      showFormError('Không lưu được bài tập thư viện. Thử lại với ảnh nhỏ hơn.');
    });
  }

  function saveEdit(event) {
    if (editingLibraryIndex >= 0) {
      saveLibraryEdit(event);
      return;
    }
    event.preventDefault();
    var workout = getWorkout(currentWorkoutId);
    var displayed = getDisplayedExercises()[selectedExerciseIndex];
    if (!workout || !displayed) return;
    var realIndex = findWorkoutExerciseIndexByDisplayed(selectedExerciseIndex);
    if (realIndex < 0) return;
    var sourceExercise = getFreshWorkoutExercise(displayed.id) || displayed;
    readExerciseForm(els.editForm, displayed.id, currentWorkoutId, sourceExercise).then(function (exercise) {
      imageDebug('[SAVE IMAGE DEBUG]', {
        exerciseId: exercise.id,
        imageId: exercise.imageId,
        imageLen: (exercise.image || '').length,
        hasCustom: D.hasCustomExerciseImage(exercise)
      });
      workout.exercises[realIndex] = exercise;
      applyMasterExerciseUpdate(exercise);
      if (!persistWorkouts()) {
        throw new Error('WORKOUT_SAVE_FAILED');
      }
      resetFormImageState('edit');
      formEditSource.edit = null;
      resetFormMediaDirty('edit');
      closeEdit();
      renderAll();
    }).catch(function (err) {
      console.error('Failed to save exercise image', err);
      var msg = 'Không lưu được ảnh minh họa.';
      if (err && err.message === 'IMAGE_TOO_LARGE') {
        msg = 'Ảnh quá lớn để lưu. Hãy chọn ảnh nhỏ hơn.';
      } else if (err && err.message === 'WORKOUT_SAVE_FAILED') {
        msg = 'Không lưu được dữ liệu bài tập (bộ nhớ đầy). Thử lại với ảnh nhỏ hơn.';
      }
      showFormError(msg);
    });
  }

  function openReplace(index) {
    selectedExerciseIndex = index;
    els.replaceForm.reset();
    formEditSource.replace = null;
    resetFormMediaDirty('replace');
    resetFormImageState('replace');
    els.replaceForm.elements.resistanceType.value = 'kg';
    els.replaceForm.elements.sets.value = 3;
    els.replaceForm.elements.reps.value = 10;
    showFormPreview(els.replaceForm, '');
    showOverlay(els.replaceOverlay);
  }

  function closeReplace() {
    hideOverlay(els.replaceOverlay);
  }

  function saveReplace(event) {
    event.preventDefault();
    var workout = getWorkout(currentWorkoutId);
    var realIndex = findWorkoutExerciseIndexByDisplayed(selectedExerciseIndex);
    if (!workout || realIndex < 0) return;
    readExerciseForm(els.replaceForm, null, currentWorkoutId).then(function (replacement) {
      workout.exercises[realIndex] = replacement;
      applyMasterExerciseUpdate(replacement);
      persistWorkouts();
      closeReplace();
      renderAll();
    }).catch(function (err) {
      console.error('Failed to replace exercise image', err);
    });
  }
  function applyWelcomeBackground() {
    if (!els.welcomeBg) return;
    var src = D.WELCOME_BACKGROUND_IMAGE || 'assets/welcome-background.jpg';
    if (els.welcomeBg.tagName === 'IMG') {
      els.welcomeBg.src = src;
    } else {
      els.welcomeBg.style.backgroundImage = 'url("' + src.replace(/"/g, '\\"') + '")';
    }
  }

  function setWelcomePageActive(active) {
    document.documentElement.classList.toggle('welcome-active', !!active);
  }

  function showWelcome() {
    if (els.welcomeScreen) els.welcomeScreen.hidden = false;
    if (els.appHome) els.appHome.hidden = true;
    if (els.libraryScreen) els.libraryScreen.hidden = true;
    setWelcomePageActive(true);
  }

  function showHome() {
    if (els.welcomeScreen) els.welcomeScreen.hidden = true;
    if (els.appHome) els.appHome.hidden = false;
    if (els.libraryScreen) els.libraryScreen.hidden = true;
    setWelcomePageActive(false);
    renderAll();
  }

  function selectTodayWorkout() {
    var todayId = D.getTodayWorkoutId();
    if (getWorkout(todayId)) {
      selectWorkout(todayId);
      return todayId;
    }
    if (!getWorkout(currentWorkoutId)) selectWorkout('a');
    return currentWorkoutId;
  }

  function welcomeOpenSchedule() {
    selectTodayWorkout();
    showHome();
    if (activeSession && activeSession.phase !== 'complete') {
      resumePromptShown = false;
      showResumeBanner();
    }
  }

  function welcomeOpenLibrary() {
    showLibrary();
  }

  function renderLibrary() {
    if (els.libraryMuscleFilter) {
      renderMuscleFilterPanel(els.libraryMuscleFilter, libraryMuscleFilter, renderLibrary);
    }
    if (!els.libraryList) return;
    var allExercises = (library && library.exercises) || [];
    if (!allExercises.length) {
      els.libraryList.innerHTML = '<div class="card"><div class="name">Chưa có bài trong thư viện</div><div class="note">Bấm “+ Thêm bài tập” để tạo bài lẻ.</div></div>';
      return;
    }
    var exercises = getFilteredLibraryExercises();
    if (!exercises.length) {
      els.libraryList.innerHTML = '<div class="card"><div class="name">Không có bài phù hợp</div><div class="note">Thử chọn “Tất cả” hoặc đổi bộ lọc / từ khóa tìm kiếm.</div></div>';
      return;
    }
    els.libraryList.innerHTML = exercises.map(function (exercise) {
      var index = findLibraryExerciseIndexById(exercise.id);
      var muscleHtml = formatMuscleTagsHtml(exercise);
      return (
        '<div class="card" data-library-index="' + index + '">' +
          '<div class="card-top">' +
            placeholderImageHtml('card-image') +
            '<div class="card-body">' +
              '<div class="name">' + escapeHtml(exercise.name) + '</div>' +
              (muscleHtml ? '<div class="muscle-tags">' + muscleHtml + '</div>' : '') +
              '<div class="meta">' + escapeHtml(D.formatExerciseMeta(exercise)) + '</div>' +
              (exercise.instructions ? '<div class="note">' + escapeHtml(exercise.instructions) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="library-actions">' +
            '<button type="button" data-library-action="detail" data-index="' + index + '">Xem chi tiết</button>' +
            '<button type="button" data-library-action="edit" data-index="' + index + '">Sửa bài</button>' +
            '<button type="button" data-library-action="train" data-index="' + index + '">Tập bài này</button>' +
            '<button type="button" data-library-action="add-schedule" data-index="' + index + '">Thêm vào lịch tập</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    var cards = els.libraryList.querySelectorAll('.card');
    exercises.forEach(function (exercise, index) {
      var slot = cards[index] && cards[index].querySelector('[data-image-slot]');
      if (!slot) return;
      Img.resolveImageSrc(exercise).then(function (src) {
        if (!src || !slot.parentNode) return;
        var img = document.createElement('img');
        img.className = 'card-image';
        img.alt = '';
        img.src = src;
        slot.replaceWith(img);
      });
    });
  }

  function showLibrary() {
    if (els.welcomeScreen) els.welcomeScreen.hidden = true;
    if (els.appHome) els.appHome.hidden = true;
    if (els.libraryScreen) els.libraryScreen.hidden = false;
    setWelcomePageActive(false);
    if (els.librarySearch && document.activeElement !== els.librarySearch) {
      libraryMuscleFilter.search = els.librarySearch.value || '';
    }
    renderLibrary();
  }

  function openAddExerciseForm() {
    if (!els.addExerciseForm) return;
    els.addExerciseForm.reset();
    formEditSource.add = null;
    resetFormMediaDirty('add');
    resetFormImageState('add');
    resetInstructionImagesState('add');
    populateMuscleGroupFields(els.addExerciseForm);
    populateSecondaryMuscleOptions(els.addExerciseForm, '', '', '');
    els.addExerciseForm.elements.sets.value = 3;
    els.addExerciseForm.elements.reps.value = 12;
    els.addExerciseForm.elements.resistance.value = 0;
    els.addExerciseForm.elements.resistanceType.value = 'kg';
    showFormPreview(els.addExerciseForm, '');
    renderInstructionGallery(els.addExerciseForm);
    showOverlay(els.addExerciseOverlay);
  }

  function closeAddExerciseForm() {
    hideOverlay(els.addExerciseOverlay);
  }

  function saveAddExercise(event) {
    event.preventDefault();
    readExerciseForm(els.addExerciseForm, null, 'lib').then(function (exercise) {
      if (!library.exercises) library.exercises = [];
      library.exercises.push(exercise);
      persistLibrary();
      syncExerciseCatalog();
      closeAddExerciseForm();
      renderLibrary();
    }).catch(function (err) {
      console.error('Failed to add library exercise', err);
    });
  }

  function startLibraryExercise(index) {
    if (window.MyFitRestAudio) window.MyFitRestAudio.unlockRestAudio();
    var exercise = library.exercises[index];
    if (!exercise) return;
    if (activeSession && activeSession.phase !== 'complete') {
      var jumpNow = activeSession.phase === 'rest-exercise';
      insertSupplementalExercise(exercise, { jumpNow: jumpNow });
      return;
    }
    resumePromptShown = true;
    activeSession = D.createWorkoutSession(
      { id: 'library', title: 'Tập theo bài · ' + exercise.name, exercises: [exercise] },
      { sessionKind: 'library', workoutName: 'Tập theo bài · ' + exercise.name }
    );
    persistSession();
    showWorkoutView();
  }

  function openAddToSchedulePicker(index) {
    selectedLibraryIndex = index;
    showOverlay(els.addToScheduleOverlay);
  }

  function closeAddToSchedulePicker() {
    hideOverlay(els.addToScheduleOverlay);
  }

  function addLibraryExerciseToSchedule(workoutId) {
    var exercise = library.exercises[selectedLibraryIndex];
    var workout = getWorkout(workoutId);
    if (!exercise || !workout) return;
    if (D.workoutHasExerciseIdentity(workout, exercise)) {
      closeAddToSchedulePicker();
      currentWorkoutId = workoutId;
      showHome();
      return;
    }
    var copy = D.clone(exercise);
    workout.exercises.push(copy);
    persistWorkouts();
    closeAddToSchedulePicker();
    currentWorkoutId = workoutId;
    showHome();
  }

  function getExerciseCatalog() {
    syncExerciseCatalog();
    return (library && library.exercises) ? library.exercises.slice() : [];
  }

  function openPickExerciseForSession(options) {
    options = options || {};
    pickMode = 'session';
    pickJumpAfterInsert = !!options.jumpAfterInsert;
    if (options.fromRest && window.MyFitRestAudio) window.MyFitRestAudio.stopRestCountdownAudio();
    if (els.pickExerciseTitle) els.pickExerciseTitle.textContent = 'Chọn bài';
    if (els.pickExerciseIntro) {
      els.pickExerciseIntro.textContent = options.fromRest
        ? 'Chọn bất kỳ bài trong thư viện để tập tiếp. Đóng lại nếu muốn dùng "Bài tiếp theo".'
        : 'Chọn bài từ thư viện chung của app.';
    }
    renderPickExerciseList();
    showOverlay(els.pickExerciseOverlay);
  }

  function closePickExercise() {
    hideOverlay(els.pickExerciseOverlay);
    pickMode = '';
    pickJumpAfterInsert = false;
  }

  function renderPickExerciseList() {
    if (els.pickMuscleFilter) {
      renderMuscleFilterPanel(els.pickMuscleFilter, pickMuscleFilter, renderPickExerciseList);
    }
    if (!els.pickExerciseList) return;
    var allExercises = getExerciseCatalog();
    if (!allExercises.length) {
      els.pickExerciseList.innerHTML = '<div class="pick-empty">Chưa có bài tập. Hãy thêm bài ở “Bài tập lẻ”.</div>';
      return;
    }
    var exercises = getFilteredCatalogExercises();
    if (!exercises.length) {
      els.pickExerciseList.innerHTML = '<div class="pick-empty">Không có bài phù hợp với bộ lọc hiện tại.</div>';
      return;
    }
    els.pickExerciseList.innerHTML = exercises.map(function (exercise) {
      return (
        '<div class="card">' +
          '<div class="name">' + escapeHtml(exercise.name) + '</div>' +
          '<div class="meta">' + escapeHtml(D.formatExerciseMeta(exercise)) + '</div>' +
          '<button type="button" class="btn" data-pick-id="' + escapeHtml(exercise.id) + '">Chọn bài này</button>' +
        '</div>'
      );
    }).join('');
  }

  function jumpToExerciseIndex(index, options) {
    options = options || {};
    if (!activeSession || index < 0 || index >= activeSession.exercises.length) return;
    clearRestTimer();
    hideOverlay(els.restOverlay);
    var target = activeSession.exercises[index];
    D.ensureSetLogs(target);
    var nextSet = Math.max(1, (target.actualSetsCompleted || 0) + 1);
    if (nextSet > target.snapshot.sets) nextSet = 1;
    activeSession.currentExerciseIndex = index;
    activeSession.currentSet = nextSet;
    activeSession.phase = 'exercise';
    activeSession.restEndTime = null;
    activeSession.restRemaining = 0;
    activeSession.restKind = null;
    persistSession();
    if (options.show !== false) showWorkoutView();
  }

  function pickExerciseForSession(exercise, options) {
    options = options || {};
    var jumpNow = options.jumpNow != null ? options.jumpNow : pickJumpAfterInsert;
    if (!exercise) return;
    if (!activeSession || activeSession.phase === 'complete') {
      var workout = getWorkout(currentWorkoutId);
      if (!workout) return;
      resumePromptShown = true;
      activeSession = D.createWorkoutSession(workout);
      jumpNow = true;
    }
    var catalogExercise = D.clone(exercise);
    var existingIdx = D.findSessionExerciseIndex(activeSession, catalogExercise);
    if (existingIdx >= 0) {
      var existing = activeSession.exercises[existingIdx];
      if (existing.completionStatus !== 'completed') {
        if ((existing.actualSetsCompleted || 0) === 0) {
          existing.snapshot = D.clone(catalogExercise);
          D.ensureSetLogs(existing);
        }
        closePickExercise();
        if (jumpNow) jumpToExerciseIndex(existingIdx);
        else persistSession();
        renderAll();
        return;
      }
    }
    insertSupplementalExercise(catalogExercise, { jumpNow: jumpNow });
  }

  function insertSupplementalExercise(exercise, options) {
    options = options || {};
    var jumpNow = options.jumpNow != null ? options.jumpNow : pickJumpAfterInsert;
    if (!activeSession || activeSession.phase === 'complete') {
      var workout = getWorkout(currentWorkoutId);
      if (!workout) return;
      resumePromptShown = true;
      activeSession = D.createWorkoutSession(workout);
      jumpNow = true;
    }
    var item = D.createSessionExercise(exercise, 'supplemental');
    var insertAt = Math.min((activeSession.currentExerciseIndex || 0) + 1, activeSession.exercises.length);
    activeSession.exercises.splice(insertAt, 0, item);
    activeSession.estimatedDuration = D.estimateWorkoutSeconds({
      exercises: activeSession.exercises.map(function (ex) { return ex.snapshot; })
    });
    persistSession();
    closePickExercise();
    if (jumpNow) {
      jumpToExerciseIndex(insertAt);
    } else if (els.workoutOverlay && els.workoutOverlay.style.display === 'flex') {
      showWorkoutView();
    }
    renderAll();
  }

  function addExerciseToActiveSession(exercise, options) {
    pickExerciseForSession(exercise, options);
  }

  function clearRestTimer() {
    if (restTimerId) {
      clearInterval(restTimerId);
      restTimerId = null;
    }
    if (window.MyFitRestAudio) window.MyFitRestAudio.stopRestCountdownAudio();
  }

  function updateRestDisplay(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    els.restTimer.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function updateRestActions() {
    if (!activeSession) return;
    var isExerciseRest = activeSession.phase === 'rest-exercise' || activeSession.restKind === 'exercise';
    if (els.restSkipBtn) {
      els.restSkipBtn.textContent = isExerciseRest ? 'Bài tiếp theo' : 'SET tiếp theo';
    }
    if (els.restPickBtn) {
      els.restPickBtn.hidden = !isExerciseRest;
    }
  }

  function updateWorkoutPickButton() {
    if (els.workoutPickBtn) els.workoutPickBtn.hidden = true;
  }

  function hasOtherIncompleteExercises(session, currentIndex) {
    return (session.exercises || []).some(function (item, index) {
      return index !== currentIndex && item.completionStatus !== 'completed';
    });
  }

  function openResistanceHistory() {
    var current = getCurrentExercise();
    if (!current) return;
    var snap = current.snapshot || {};
    var rows = D.getExerciseLoadHistory(snap.id, D.exerciseIdentityKey(snap));
    if (els.resistanceHistoryTitle) {
      els.resistanceHistoryTitle.textContent = 'LỊCH SỬ TẠ · ' + (snap.name || '');
    }
    if (!els.resistanceHistoryContent) return;
    if (!rows.length) {
      els.resistanceHistoryContent.innerHTML = '<p class="note">Chưa có lịch sử mức tạ cho bài này.</p>';
    } else {
      els.resistanceHistoryContent.innerHTML = rows.map(function (row) {
        return (
          '<div class="resistance-history-day">' +
            '<div class="resistance-history-date">' + escapeHtml(row.dateLabel) + ':</div>' +
            row.logs.map(function (log) {
              return '<div class="set-log-line">' + escapeHtml(D.formatSetLogLine(log)) + '</div>';
            }).join('') +
          '</div>'
        );
      }).join('');
    }
    showOverlay(els.resistanceHistoryOverlay);
  }

  function closeResistanceHistory() {
    hideOverlay(els.resistanceHistoryOverlay);
  }

  function beginRest(kind, seconds) {
    activeSession.phase = kind === 'set' ? 'rest-set' : 'rest-exercise';
    activeSession.restKind = kind;
    activeSession.restEndTime = new Date(Date.now() + seconds * 1000).toISOString();
    activeSession.restRemaining = seconds;
    persistSession();
    hideOverlay(els.workoutOverlay);
    els.restLabel.textContent = kind === 'set' ? 'Nghỉ giữa SET' : 'Nghỉ giữa BÀI TẬP';
    clearRestTimer();
    if (window.MyFitRestAudio) window.MyFitRestAudio.resetCountdownAudio();
    updateRestDisplay(seconds);
    updateRestActions();
    showOverlay(els.restOverlay, 'flex');
    if (window.MyFitRestAudio) window.MyFitRestAudio.handleRestCountdownTick(seconds);
    restTimerId = setInterval(tickRest, 1000);
  }

  function finishRestAdvance() {
    clearRestTimer();
    hideOverlay(els.restOverlay);
    if (!activeSession) return;
    activeSession.restEndTime = null;
    activeSession.restRemaining = 0;
    activeSession.restKind = null;
    if (activeSession.phase === 'rest-set') {
      activeSession.phase = 'exercise';
      activeSession.currentSet += 1;
      persistSession();
      showWorkoutView();
      return;
    }
    if (activeSession.phase === 'rest-exercise') {
      var nextIdx = D.findNextDefaultExerciseIndex(activeSession);
      if (nextIdx < 0) {
        finishWorkout();
        return;
      }
      jumpToExerciseIndex(nextIdx);
      return;
    }
  }

  function tickRest() {
    if (!activeSession || !activeSession.restEndTime) return;
    var remaining = Math.max(0, Math.ceil((new Date(activeSession.restEndTime).getTime() - Date.now()) / 1000));
    activeSession.restRemaining = remaining;
    updateRestDisplay(remaining);
    if (remaining > 0) {
      if (window.MyFitRestAudio) window.MyFitRestAudio.handleRestCountdownTick(remaining);
      persistSession();
      return;
    }
    persistSession();
    clearRestTimer();
    if (window.MyFitRestAudio && window.MyFitRestAudio.playGoCue) {
      window.MyFitRestAudio.playGoCue(finishRestAdvance);
    } else {
      finishRestAdvance();
    }
  }

  function skipRest() {
    if (!activeSession) return;
    if (window.MyFitRestAudio) window.MyFitRestAudio.stopRestCountdownAudio();
    clearRestTimer();
    activeSession.restEndTime = new Date().toISOString();
    activeSession.restRemaining = 0;
    finishRestAdvance();
  }

  function addRestSeconds() {
    if (!activeSession || !activeSession.restEndTime) return;
    if (window.MyFitRestAudio) window.MyFitRestAudio.resetCountdownAudio();
    var end = new Date(activeSession.restEndTime).getTime() + 15000;
    activeSession.restEndTime = new Date(end).toISOString();
    tickRest();
  }

  function resumeRestIfNeeded() {
    if (!activeSession) return;
    if (activeSession.phase === 'rest-set' || activeSession.phase === 'rest-exercise') {
      var remaining = Math.max(0, Math.ceil((new Date(activeSession.restEndTime).getTime() - Date.now()) / 1000));
      if (remaining <= 0) {
        finishRestAdvance();
      } else {
        beginRest(activeSession.restKind, remaining);
      }
      return true;
    }
    return false;
  }

  function readCurrentSetResistanceFromUi() {
    if (!els.wSetResistance) return null;
    return {
      resistance: Math.max(0, parseFloat(els.wSetResistance.value) || 0),
      resistanceType: (els.wSetResistanceType && els.wSetResistanceType.value) || 'kg'
    };
  }

  function writeCurrentSetResistanceToUi(log) {
    if (!log) return;
    if (els.wSetResistance) {
      els.wSetResistance.value = log.resistance != null ? log.resistance : 0;
    }
    if (els.wSetResistanceType) {
      var uiType = log.resistanceType || 'kg';
      if (uiType === 'bodyweight') uiType = 'band';
      els.wSetResistanceType.value = uiType;
    }
  }

  function syncUiResistanceIntoSession() {
    var current = getCurrentExercise();
    if (!current || !activeSession) return;
    D.ensureSetLogs(current);
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    if (!current.setLogs[setIndex]) return;
    var values = readCurrentSetResistanceFromUi();
    if (!values) return;
    current.setLogs[setIndex].resistance = values.resistance;
    current.setLogs[setIndex].resistanceType = values.resistanceType;
  }

  function updatePrimaryActionLabel() {
    var btn = document.getElementById('complete-set-btn');
    if (!btn || !activeSession) return;
    var current = getCurrentExercise();
    if (!current) return;
    var plannedSets = current.snapshot.sets;
    var isLastSet = activeSession.currentSet >= plannedSets;
    var otherIncomplete = hasOtherIncompleteExercises(activeSession, activeSession.currentExerciseIndex);
    if (isLastSet && !otherIncomplete) {
      btn.textContent = 'Hoàn thành buổi tập';
    } else if (isLastSet) {
      btn.textContent = 'Bài tiếp theo';
    } else {
      btn.textContent = 'Hoàn thành SET';
    }
  }

  function resetWorkoutScroll() {
    var scrollEl = document.querySelector('.workout-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function showWorkoutView() {
    var current = getCurrentExercise();
    if (!current) return;
    D.ensureSetLogs(current);
    var snap = current.snapshot;
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    var log = current.setLogs[setIndex] || current.setLogs[0];
    els.wprog.textContent = 'Bài ' + (activeSession.currentExerciseIndex + 1) + '/' + activeSession.exercises.length +
      (current.role === 'supplemental' ? ' · Bổ sung' : '');
    els.wname.textContent = snap.name;
    els.wmeta.textContent = D.formatExerciseMeta(snap);
    els.wset.textContent = [snap.instructions, snap.tips, snap.commonMistakes, snap.notes].filter(Boolean).join('\n\n');
    els.wsetDisplay.textContent = 'SET ' + activeSession.currentSet + ' / ' + snap.sets;
    els.wrepsDisplay.textContent = snap.reps + ' REPS';
    writeCurrentSetResistanceToUi(log);
    updatePrimaryActionLabel();
    updateWorkoutPickButton();
    applyImageToElement(els.wimage, snap);
    hideOverlay(els.restOverlay);
    hideOverlay(els.completionOverlay);
    showOverlay(els.workoutOverlay, 'flex');
    resetWorkoutScroll();
    persistSession();
  }

  function startWorkout(fromExerciseIndex) {
    if (activeSession && !resumePromptShown) return;
    var workout = getWorkout(currentWorkoutId);
    activeSession = D.createWorkoutSession(workout);
    if (typeof fromExerciseIndex === 'number') {
      activeSession.currentExerciseIndex = fromExerciseIndex;
    }
    activeSession.startTime = new Date().toISOString();
    persistSession();
    showWorkoutView();
  }

  function startSelectedWorkout() {
    if (detailContext.mode === 'library' && detailContext.libraryIndex >= 0) {
      closeDetail();
      startLibraryExercise(detailContext.libraryIndex);
      return;
    }
    closeDetail();
    startWorkout(selectedExerciseIndex);
  }

  function completeSet() {
    var current = getCurrentExercise();
    if (!current || !activeSession) return;
    D.ensureSetLogs(current);
    syncUiResistanceIntoSession();
    var setIndex = Math.max(0, (activeSession.currentSet || 1) - 1);
    var log = current.setLogs[setIndex];
    if (log) {
      log.completed = true;
      log.reps = current.snapshot.reps;
      current.actualResistance = log.resistance;
    }
    current.actualSetsCompleted += 1;
    current.actualReps = current.snapshot.reps;
    current.completionStatus = 'in-progress';
    var plannedSets = current.snapshot.sets;
    if (activeSession.currentSet < plannedSets) {
      // Prefill next set with this set's resistance (UX), without changing exercise default.
      var next = current.setLogs[setIndex + 1];
      if (next && log) {
        next.resistance = log.resistance;
        next.resistanceType = log.resistanceType;
      }
      persistSession();
      beginRest('set', D.REST_SET_SECONDS);
      return;
    }
    completeExercise(false);
  }

  function completeExercise(skipSetRest) {
    var current = getCurrentExercise();
    if (!current || !activeSession) return;
    syncUiResistanceIntoSession();
    current.completionStatus = 'completed';
    D.assignActualOrder(activeSession, current);
    persistSession();
    if (skipSetRest !== false) {
      clearRestTimer();
      hideOverlay(els.restOverlay);
    }
    if (!D.hasIncompleteExercises(activeSession)) {
      finishWorkout();
      return;
    }
    beginRest('exercise', D.REST_EXERCISE_SECONDS);
  }

  function finishWorkout() {
    if (!activeSession) return;
    clearRestTimer();
    activeSession.endTime = new Date().toISOString();
    activeSession.phase = 'complete';
    activeSession.actualDuration = Math.max(
      0,
      Math.round((new Date(activeSession.endTime).getTime() - new Date(activeSession.startTime).getTime()) / 1000)
    );
    var historyEntry = D.finalizeHistoryEntry(activeSession);
    var history = D.loadHistory();
    history.unshift(historyEntry);
    D.saveHistory(history);

    var completedExercises = activeSession.exercises.filter(function (item) {
      return item.completionStatus === 'completed';
    }).length;
    var totalSets = activeSession.exercises.reduce(function (sum, item) {
      return sum + item.actualSetsCompleted;
    }, 0);

    els.completionStats.innerHTML =
      '<div class="stat-card"><div class="stat-label">Thời gian dự kiến</div><div class="stat-value">' + escapeHtml(D.formatClockDuration(activeSession.estimatedDuration)) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Thời gian thực tế</div><div class="stat-value">' + escapeHtml(D.formatClockDuration(activeSession.actualDuration)) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Bài đã hoàn thành</div><div class="stat-value">' + completedExercises + '/' + activeSession.exercises.length + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Tổng số set thực tế</div><div class="stat-value">' + totalSets + '</div></div>';

    hideOverlay(els.workoutOverlay);
    hideOverlay(els.restOverlay);
    showOverlay(els.completionOverlay, 'flex');
    activeSession = null;
    D.saveActiveSession(null);
    renderHistory();
  }

  function closeWorkout() {
    if (activeSession) persistSession();
    clearRestTimer();
    hideOverlay(els.workoutOverlay);
    hideOverlay(els.restOverlay);
  }

  function closeCompletion() {
    hideOverlay(els.completionOverlay);
    renderAll();
  }

  function showResumeBanner() {
    if (!activeSession || resumePromptShown) return;
    resumePromptShown = true;
    els.resumeBanner.style.display = 'block';
  }

  function continueWorkout() {
    els.resumeBanner.style.display = 'none';
    if (!activeSession) return;
    if (activeSession.phase === 'complete') {
      activeSession = null;
      D.saveActiveSession(null);
      return;
    }
    if (resumeRestIfNeeded()) return;
    showWorkoutView();
  }

  function discardWorkout() {
    els.resumeBanner.style.display = 'none';
    activeSession = null;
    D.saveActiveSession(null);
    clearRestTimer();
    hideOverlay(els.workoutOverlay);
    hideOverlay(els.restOverlay);
  }

  function bindWorkoutAudioUnlock() {
    if (!window.MyFitRestAudio || !window.MyFitRestAudio.unlockRestAudio) return;
    var unlock = function () {
      window.MyFitRestAudio.unlockRestAudio();
    };
    var completeSetBtn = document.getElementById('complete-set-btn');
    var completeExerciseBtn = document.getElementById('complete-exercise-btn');
    var restSkipBtn = document.getElementById('rest-skip-btn');
    var restAddBtn = document.getElementById('rest-add-btn');
    var restPickBtn = document.getElementById('rest-pick-exercise-btn');
    var resumeContinueBtn = document.getElementById('resume-continue-btn');
    var startWorkoutBtn = document.getElementById('start-workout-btn');
    var detailStartBtn = document.getElementById('detail-start-btn');
    var welcomeScheduleBtn = document.getElementById('welcome-schedule-btn');
    var welcomeLibraryBtn = document.getElementById('welcome-library-btn');
    if (completeSetBtn) completeSetBtn.addEventListener('click', unlock, true);
    if (completeExerciseBtn) completeExerciseBtn.addEventListener('click', unlock, true);
    if (restSkipBtn) restSkipBtn.addEventListener('click', unlock, true);
    if (restAddBtn) restAddBtn.addEventListener('click', unlock, true);
    if (restPickBtn) restPickBtn.addEventListener('click', unlock, true);
    if (resumeContinueBtn) resumeContinueBtn.addEventListener('click', unlock, true);
    if (startWorkoutBtn) startWorkoutBtn.addEventListener('click', unlock, true);
    if (detailStartBtn) detailStartBtn.addEventListener('click', unlock, true);
    if (welcomeScheduleBtn) welcomeScheduleBtn.addEventListener('click', unlock, true);
    if (welcomeLibraryBtn) welcomeLibraryBtn.addEventListener('click', unlock, true);
  }

  function bindEvents() {
    bindWorkoutAudioUnlock();
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        selectWorkout(tab.dataset.workoutId);
      });
    });

    document.getElementById('start-workout-btn').addEventListener('click', function () {
      resumePromptShown = true;
      startWorkout(0);
    });

    var jumpHistoryBtn = document.getElementById('jump-history-btn');
    if (jumpHistoryBtn) jumpHistoryBtn.addEventListener('click', jumpToHistory);

    var homeBackBtn = document.getElementById('home-back-btn');
    if (homeBackBtn) homeBackBtn.addEventListener('click', showWelcome);

    var saveOrderBtn = document.getElementById('save-order-default-btn');
    if (saveOrderBtn) saveOrderBtn.addEventListener('click', saveDisplayedOrderAsDefault);

    var addToSessionBtn = document.getElementById('add-to-session-btn');
    if (addToSessionBtn) addToSessionBtn.style.display = 'none';

    els.list.addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (!target) return;
      var index = parseInt(target.dataset.index, 10);
      if (target.dataset.action === 'detail') openDetail(index);
      if (target.dataset.action === 'edit') openEdit(index);
      if (target.dataset.action === 'replace') openReplace(index);
      if (target.dataset.action === 'move-up') moveDisplayedExercise(index, -1);
      if (target.dataset.action === 'move-down') moveDisplayedExercise(index, 1);
    });

    els.historyList.addEventListener('click', function (event) {
      var card = event.target.closest('[data-history-index]');
      if (!card) return;
      openHistoryDetail(parseInt(card.dataset.historyIndex, 10));
    });

    els.week.addEventListener('click', function (event) {
      var dayEl = event.target.closest('.day.clickable');
      if (!dayEl) return;
      var workoutId = dayEl.dataset.workoutId;
      if (workoutId) selectWorkout(workoutId);
    });

    document.getElementById('detail-close-btn').addEventListener('click', closeDetail);
    document.getElementById('detail-start-btn').addEventListener('click', startSelectedWorkout);
    if (els.detailEditBtn) {
      els.detailEditBtn.addEventListener('click', function () {
        if (detailContext.mode === 'library' && detailContext.libraryIndex >= 0) {
          closeDetail();
          openLibraryEdit(detailContext.libraryIndex);
        }
      });
    }
    document.getElementById('edit-close-btn').addEventListener('click', closeEdit);
    document.getElementById('replace-close-btn').addEventListener('click', closeReplace);
    document.getElementById('history-detail-close-btn').addEventListener('click', closeHistoryDetail);
    els.editForm.addEventListener('submit', saveEdit);
    els.replaceForm.addEventListener('submit', saveReplace);
    bindImagePicker(els.editForm);
    bindImagePicker(els.replaceForm);
    [els.addExerciseForm, els.editForm, els.replaceForm].forEach(function (form) {
      if (!form) return;
      populateMuscleGroupFields(form);
      bindInstructionGallery(form);
    });

    if (els.addExerciseForm) {
      document.getElementById('add-exercise-close-btn').addEventListener('click', closeAddExerciseForm);
      els.addExerciseForm.addEventListener('submit', saveAddExercise);
      bindImagePicker(els.addExerciseForm);
    }
    var libraryAddBtn = document.getElementById('library-add-btn');
    if (libraryAddBtn) libraryAddBtn.addEventListener('click', openAddExerciseForm);

    if (els.libraryList) {
      els.libraryList.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-library-action]');
        if (!btn) return;
        var index = parseInt(btn.dataset.index, 10);
        if (btn.dataset.libraryAction === 'detail') openLibraryDetail(index);
        if (btn.dataset.libraryAction === 'edit') openLibraryEdit(index);
        if (btn.dataset.libraryAction === 'train') startLibraryExercise(index);
        if (btn.dataset.libraryAction === 'add-schedule') openAddToSchedulePicker(index);
      });
    }

    if (els.librarySearch && !els.librarySearch.dataset.bound) {
      els.librarySearch.dataset.bound = '1';
      els.librarySearch.addEventListener('input', function () {
        libraryMuscleFilter.search = els.librarySearch.value || '';
        renderLibrary();
      });
    }

    if (els.pickExerciseSearch && !els.pickExerciseSearch.dataset.bound) {
      els.pickExerciseSearch.dataset.bound = '1';
      els.pickExerciseSearch.addEventListener('input', function () {
        pickMuscleFilter.search = els.pickExerciseSearch.value || '';
        renderPickExerciseList();
      });
    }

    if (els.pickExerciseList) {
      document.getElementById('pick-exercise-close-btn').addEventListener('click', closePickExercise);
      els.pickExerciseList.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-pick-id]');
        if (!btn) return;
        var exerciseId = btn.dataset.pickId;
        var catalog = getExerciseCatalog();
        var exercise = catalog.filter(function (ex) { return ex.id === exerciseId; })[0];
        if (!exercise) return;
        if (pickMode === 'session') pickExerciseForSession(exercise);
      });
    }

    if (els.addToScheduleOverlay) {
      document.getElementById('add-to-schedule-close-btn').addEventListener('click', closeAddToSchedulePicker);
      els.addToScheduleOverlay.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-add-schedule]');
        if (!btn) return;
        addLibraryExerciseToSchedule(btn.dataset.addSchedule);
      });
    }

    if (els.wSetResistance) {
      els.wSetResistance.addEventListener('change', function () {
        syncUiResistanceIntoSession();
        persistSession();
      });
    }
    if (els.wSetResistanceType) {
      els.wSetResistanceType.addEventListener('change', function () {
        syncUiResistanceIntoSession();
        persistSession();
      });
    }

    if (els.wResistanceHistoryBtn) {
      els.wResistanceHistoryBtn.addEventListener('click', openResistanceHistory);
    }
    var resistanceHistoryCloseBtn = document.getElementById('resistance-history-close-btn');
    if (resistanceHistoryCloseBtn) {
      resistanceHistoryCloseBtn.addEventListener('click', closeResistanceHistory);
    }

    document.getElementById('complete-set-btn').addEventListener('click', completeSet);
    document.getElementById('complete-exercise-btn').addEventListener('click', function () {
      syncUiResistanceIntoSession();
      completeExercise(true);
    });
    document.getElementById('workout-close-btn').addEventListener('click', closeWorkout);
    if (els.workoutPickBtn) {
      els.workoutPickBtn.addEventListener('click', function () {
        openPickExerciseForSession({ jumpAfterInsert: false, fromRest: false });
      });
    }
    if (els.restPickBtn) {
      els.restPickBtn.addEventListener('click', function () {
        openPickExerciseForSession({ jumpAfterInsert: true, fromRest: true });
      });
    }
    document.getElementById('rest-skip-btn').addEventListener('click', skipRest);
    document.getElementById('rest-add-btn').addEventListener('click', addRestSeconds);
    document.getElementById('completion-home-btn').addEventListener('click', closeCompletion);
    document.getElementById('resume-continue-btn').addEventListener('click', continueWorkout);
    document.getElementById('resume-discard-btn').addEventListener('click', discardWorkout);

    var welcomeScheduleBtn = document.getElementById('welcome-schedule-btn');
    var welcomeLibraryBtn = document.getElementById('welcome-library-btn');
    var libraryBackBtn = document.getElementById('library-back-btn');
    var libraryToScheduleBtn = document.getElementById('library-to-schedule-btn');
    if (welcomeScheduleBtn) welcomeScheduleBtn.addEventListener('click', welcomeOpenSchedule);
    if (welcomeLibraryBtn) welcomeLibraryBtn.addEventListener('click', welcomeOpenLibrary);
    if (libraryBackBtn) libraryBackBtn.addEventListener('click', showWelcome);
    if (libraryToScheduleBtn) libraryToScheduleBtn.addEventListener('click', welcomeOpenSchedule);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then(function (registration) {
        function checkForUpdate() {
          registration.update().catch(function () {});
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
        checkForUpdate();
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);
      })
      .catch(function (err) {
        console.warn('Service worker registration failed', err);
      });
  }

  function init() {
    if (!getWorkout(currentWorkoutId)) currentWorkoutId = 'a';
    applyWelcomeBackground();
    bindEvents();
    renderAll();
    showWelcome();
    if (activeSession && activeSession.phase !== 'complete') {
      resumePromptShown = false;
    }
    registerServiceWorker();
  }

  window.MyFitApp = {
    getWorkouts: function () { return workouts; },
    getLibrary: function () { return library; },
    getActiveSession: function () { return activeSession; },
    setActiveSession: function (session) { activeSession = session; persistSession(); },
    selectWorkout: selectWorkout,
    startWorkout: startWorkout,
    completeSet: completeSet,
    completeExercise: completeExercise,
    finishWorkout: finishWorkout,
    saveWorkouts: persistWorkouts,
    renderAll: renderAll,
    renderHistory: renderHistory,
    openHistoryDetail: openHistoryDetail,
    jumpToHistory: jumpToHistory,
    beginRest: beginRest,
    tickRest: tickRest,
    finishRestAdvance: finishRestAdvance,
    skipRest: skipRest,
    addRestSeconds: addRestSeconds,
    showWorkoutView: showWorkoutView,
    continueWorkout: continueWorkout,
    openEdit: openEdit,
    openReplace: openReplace,
    showWelcome: showWelcome,
    showHome: showHome,
    showLibrary: showLibrary,
    welcomeOpenSchedule: welcomeOpenSchedule,
    welcomeOpenLibrary: welcomeOpenLibrary,
    moveDisplayedExercise: moveDisplayedExercise,
    saveDisplayedOrderAsDefault: saveDisplayedOrderAsDefault,
    addExerciseToActiveSession: addExerciseToActiveSession,
    insertSupplementalExercise: insertSupplementalExercise,
    pickExerciseForSession: pickExerciseForSession,
    openPickExerciseForSession: openPickExerciseForSession,
    closePickExercise: closePickExercise,
    getExerciseCatalog: getExerciseCatalog,
    updateRestActions: updateRestActions,
    jumpToExerciseIndex: jumpToExerciseIndex,
    openResistanceHistory: openResistanceHistory,
    startLibraryExercise: startLibraryExercise
  };

  init();
})();
