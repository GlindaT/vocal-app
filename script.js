// Añadir al inicio del archivo para asegurar que la DB cargue
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        console.log("Database Ready");
        // Cargar vistas iniciales
        renderLibrary();
    } catch (err) {
        console.error(err);
    }
});

// Reutilizar el buffer para el afinador
const pitchBuffer = new Float32Array(2048);

// ==========================================
// CONFIG GLOBAL
// ==========================================
const state = {
  instrumentalUrl: null,
  letraLrc: "",
  isRecording: false
};

let db = null;
let pitchHistory = [];
let transcriptionSegments = [];
let baseTranscriptionSegments = [];

function $(id) {
  return document.getElementById(id);
}

function safeAdd(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

// ==========================================
// INDEXED DB - BIBLIOTECA
// ==========================================
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("VocalAppDB", 1);

    request.onupgradeneeded = function (event) {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("library")) {
        const store = database.createObjectStore("library", {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("type", "type", { unique: false });
        store.createIndex("date", "date", { unique: false });
      }
    };

    request.onsuccess = function (event) {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = function () {
      reject("❌ Error al abrir IndexedDB");
    };
  });
}

function addLibraryItem(item) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["library"], "readwrite");
    const store = transaction.objectStore("library");
    const request = store.add(item);

    request.onsuccess = function () {
      resolve();
    };

    request.onerror = function () {
      reject("❌ Error al guardar en IndexedDB");
    };
  });
}

function getAllLibraryItems() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["library"], "readonly");
    const store = transaction.objectStore("library");
    const request = store.getAll();

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject("❌ Error al leer Biblioteca");
    };
  });
}

function updateLibraryItem(id, changes) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["library"], "readwrite");
    const store = transaction.objectStore("library");
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return reject("Archivo no encontrado");

      const updatedItem = { ...item, ...changes };
      const putReq = store.put(updatedItem);

      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject("Error al actualizar la BD");
    };

    getReq.onerror = () => reject("Error al buscar en BD");
  });
}

function deleteLibraryItemFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["library"], "readwrite");
    const store = transaction.objectStore("library");
    const request = store.delete(id);

    request.onsuccess = function () {
      resolve();
    };

    request.onerror = function () {
      reject("❌ Error al eliminar archivo");
    };
  });
}

function getLibraryItemsByType(type) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["library"], "readonly");
    const store = transaction.objectStore("library");
    const index = store.index("type");
    const request = index.getAll(type);

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject("❌ Error al filtrar archivos por tipo");
    };
  });
}

function getLibraryItemById(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["library"], "readonly");
    const store = transaction.objectStore("library");
    const request = store.get(id);

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject("❌ Error al obtener archivo");
    };
  });
}

// ==========================================
// NAVEGACIÓN
// ==========================================
function showTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.remove("active");
  });

  const target = $(tabId);
  if (target) target.classList.add("active");

  document.querySelectorAll(".sidebar button").forEach(btn => {
    btn.classList.remove("active");
  });

  const btnMap = {
    afinador: "btnAfinador",
    estudio: "btnEstudio",
    biblioteca: "btnBiblioteca",
    karaoke: "btnKaraoke",
    splitter: "btnSplitter",
    config: "btnConfig"
  };

  const activeBtn = $(btnMap[tabId]);
  if (activeBtn) activeBtn.classList.add("active");
}

// ==========================================
// AFINADOR
// ==========================================
let audioContext, analyser, stream;

async function toggleRecording() {
  const btn = $("recordBtn");

  if (!state.isRecording) {
    state.isRecording = true;
    btn.textContent = "Detener";
    btn.classList.add("recording");
    await startAfinador();
  } else {
    state.isRecording = false;
    btn.textContent = "Iniciar";
    btn.classList.remove("recording");
    stopAfinador();

    if ($("noteDisplay")) $("noteDisplay").textContent = "--";
    if ($("guideText")) $("guideText").textContent = "";
  }
}

async function startAfinador() {
  audioContext = new AudioContext();

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  const mic = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  mic.connect(analyser);

  setTimeout(() => {
    detectPitch();
  }, 300);
}

function stopAfinador() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
}

function detectPitch() {
  if (!state.isRecording || !analyser) return;

  // Usamos el buffer global en lugar de crear uno nuevo cada 16ms
  analyser.getFloatTimeDomainData(pitchBuffer);
  const pitch = autoCorrelate(pitchBuffer, audioContext.sampleRate);
  
  if (document.getElementById("karaokeCanvas")) {
    // Asegúrate de que esta función esté definida o comentada para evitar errores
    if (typeof drawKaraokeMonitor === 'function') drawKaraokeMonitor(0, pitch); 
  }

  const display = $("noteDisplay");
  const guide = $("guideText");
  const targetNoteEl = $("targetNote");
  const targetNote = targetNoteEl ? targetNoteEl.value : "E2";

  if (display && guide) {
    if (pitch !== -1) {
      const noteFull = getNoteFromFrequency(pitch);
      const targetFreq = getNoteFrequency(targetNote);
      // Evitar logaritmo de 0 o infinito
      const cents = 1200 * Math.log2(pitch / targetFreq);

      display.textContent = noteFull;

      const dificultad = localStorage.getItem("vocalApp_difficulty") || "medio";
      let maxDesviation = 30;
        if (dificultad === "facil") maxDesviation = 50;
        else if (dificultad === "dificil") maxDesviation = 15;
        else if (dificultad === "experto") maxDesviation = 5;
        
        // Asegúrate de que las llaves envuelven correctamente cada bloque
        if (Math.abs(cents) <= maxDesviation) {
            display.style.color = "#22c55e"; 
            guide.textContent = `🎯 ¡En la nota! (${targetNote})`;
            guide.style.color = "#22c55e";
        } else if (cents < 0) {
            display.style.color = "#f59e0b";
            guide.textContent = `⬆️ Estás grave. Sube a ${targetNote}`;
            guide.style.color = "#f59e0b";
        } else {
            display.style.color = "#f59e0b";
            guide.textContent = `⬇️ Estás agudo. Baja a ${targetNote}`;
            guide.style.color = "#f59e0b";
        }
    } else {
      display.textContent = "--";
      display.style.color = "white";
      guide.textContent = "🎤 Esperando voz...";
    }
  }
  requestAnimationFrame(detectPitch);
}

function getNoteFromFrequency(freq) {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const A4 = 440;
  const n = Math.round(12 * Math.log2(freq / A4));
  const index = (n + 9) % 12;
  const octave = 4 + Math.floor((n + 9) / 12);
  return notes[(index + 12) % 12] + octave;
}

function getNoteFrequency(note) {
  const notes = {
    "C": -9,
    "C#": -8,
    "D": -7,
    "D#": -6,
    "E": -5,
    "F": -4,
    "F#": -3,
    "G": -2,
    "G#": -1,
    "A": 0,
    "A#": 1,
    "B": 2
  };

  const match = note.match(/^([A-G]#?)(\d)$/);
  if (!match) return 440;

  const [, noteName, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);

  const semitoneOffset = notes[noteName] + (octave - 4) * 12;
  return 440 * Math.pow(2, semitoneOffset / 12);
}

function autoCorrelate(buf, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / buf.length);

  // Si el volumen es muy bajo, ignoramos la detección
  if (rms < 0.01) return -1;

  let bestOffset = -1;
  let bestCorrelation = 0;

  for (let offset = 8; offset < 1000; offset++) {
    let correlation = 0;

    for (let i = 0; i < buf.length - offset; i++) {
      correlation += Math.abs(buf[i] - buf[i + offset]);
    }

    correlation = 1 - (correlation / (buf.length - offset));

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestCorrelation < 0.85 || bestOffset === -1) return -1;

  const frequency = sampleRate / bestOffset;

  // Ignorar frecuencias absurdas para voz humana cantada
  if (frequency < 60 || frequency > 1200) return -1;

  return frequency;
}
// ==========================================
// ESTADO ESTUDIO / BIBLIOTECA
// ==========================================
let studioMediaRecorder = null;
let studioStream = null;
let studioChunks = [];
let studioRecordedBlob = null;
let studioTrackFileName = "";
let selectedVoiceBlob = null;
let selectedVoiceId = null;


// ==========================================
// ESTUDIO
// ==========================================
function cargarAudioEstudio(e) {
  const file = e.target.files[0];
  if (!file) return;

  studioTrackFileName = file.name;

  const url = URL.createObjectURL(file);
  $("player").src = url;
  $("studioStatus").textContent = `Estado: pista cargada (${file.name})`;
}

function playTrack() {
  const player = $("player");

  if (!player || !player.src) {
    alert("⚠️ Primero sube una pista");
    return;
  }

  player.play();
}

function pauseTrack() {
  const player = $("player");
  if (player) player.pause();
}

function stopTrack() {
  const player = $("player");
  if (!player) return;

  player.pause();
  player.currentTime = 0;
  updateKaraokeHighlight(0);
}

async function startStudioRecording() {
  try {
    const player = $("player");

    studioChunks = [];
    studioRecordedBlob = null;
    $("voicePlayer").src = "";

    $("studioStatus").textContent = "Estado: preparando grabación...";

    studioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: 48000
      }
    });

    const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : {};
    
    studioMediaRecorder = new MediaRecorder(studioStream, options);

    studioMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        studioChunks.push(event.data);
      }
    };

    studioMediaRecorder.onstop = () => {
      studioRecordedBlob = new Blob(studioChunks, { type: "audio/webm" });
      const audioURL = URL.createObjectURL(studioRecordedBlob);
      $("voicePlayer").src = audioURL;
      $("studioStatus").textContent = "Estado: grabación lista para escuchar o guardar";
    };

    studioMediaRecorder.start();
    $("studioStatus").textContent = "Estado: grabando voz...";

    if (player && player.src) {
      player.currentTime = 0;
      player.play();
    }
  } catch (error) {
    console.error(error);
    $("studioStatus").textContent = "Estado: error al acceder al micrófono";
    alert("❌ No se pudo acceder al micrófono");
  }
}

function stopStudioRecording() {
  if (studioMediaRecorder && studioMediaRecorder.state !== "inactive") {
    studioMediaRecorder.stop();
  }

  if (studioStream) {
    studioStream.getTracks().forEach(track => track.stop());
  }

  const player = $("player");
  if (player) {
    player.pause();
  }
}

function redoStudioRecording() {
  studioChunks = [];
  studioRecordedBlob = null;
  $("voicePlayer").src = "";
  $("studioStatus").textContent = "Estado: grabación eliminada. Lista para volver a grabar.";
}

function saveStudioRecording() {
  if (!studioRecordedBlob) {
    alert("⚠️ No hay grabación para guardar");
    return;
  }

  const baseName = studioTrackFileName
    ? `Voz - ${studioTrackFileName}`
    : "Grabación de voz";

  saveToLibrary(studioRecordedBlob, {
    name: baseName,
    type: "voz"
  });

  $("studioStatus").textContent = "Estado: grabación guardada en Biblioteca";
}

// ==========================================
// BIBLIOTECA
// ==========================================
async function saveToLibrary(blob, options = {}) {
  try {
    await addLibraryItem({
      name: options.name || "Audio",
      type: options.type || "audio",
      audioBlob: blob,
      date: new Date().toLocaleString("es-ES"),
      transcription: options.transcription || [] // Añadir campo para evitar errores
    });

    await renderLibrary(); // Antes decía loadLibrary (error)
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo guardar en Biblioteca");
  }
}

async function renderLibrary(filter = 'todos') {
  const container = $("libraryList");
  if (!container) return;

  container.innerHTML = "<p>Cargando archivos...</p>";

  try {
    let library = await getAllLibraryItems();

    // Filtramos según la carpeta seleccionada
    let filteredItems = library;
    if (filter !== 'todos') {
      filteredItems = library.filter(item => item.type === filter);
    }

    container.innerHTML = "";

    if (filteredItems.length === 0) {
      container.innerHTML = `<p>La carpeta '${filter}' está vacía.</p>`;
    } else {
      filteredItems.forEach((item) => {
        const div = document.createElement("div");
        div.className = "library-item card"; // Usamos la clase card para que se vea bien
        div.style.marginBottom = "10px";

        const audioURL = URL.createObjectURL(item.audioBlob);

        div.innerHTML = `
          <p><strong>${item.name}</strong></p>
          <small>Tipo: ${item.type.toUpperCase()} | ${item.date}</small>
          <audio controls src="${audioURL}" style="width:100%; margin: 10px 0;"></audio>
          <button type="button" data-id="${item.id}" class="delete-library-btn" style="background:#e11d48;">🗑️ Eliminar</button>
        `;
        container.appendChild(div);
      });
    }

    // Reactivar botones de borrar
    document.querySelectorAll(".delete-library-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        await deleteLibraryItem(id);
        renderLibrary(filter); // Recargamos la misma vista
      });
    });

    // Actualizamos los selectores del Estudio y Karaoke para que vean los cambios
    await loadVoiceOptionsInStudio();
    await loadTrackOptionsInStudio();
    await loadTrackOptionsInKaraoke();

  } catch (error) {
    console.error(error);
    container.innerHTML = "<p>❌ Error al cargar la biblioteca.</p>";
  }
}

async function deleteLibraryItem(id) {
  try {
    await deleteLibraryItemFromDB(id);
    await loadLibrary();
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo eliminar el archivo");
  }
}

async function saveManualFileToLibrary() {
  const fileInput = $("libraryFileInput");
  const typeSelect = $("libraryFileType");
  const nameInput = $("libraryFileName");

  const file = fileInput ? fileInput.files[0] : null;
  const type = typeSelect ? typeSelect.value : "audio";
  const customName = nameInput ? nameInput.value.trim() : "";

  if (!file) {
    alert("⚠️ Selecciona un archivo de audio");
    return;
  }

  const finalName = customName || file.name;

  try {
    await addLibraryItem({
      name: finalName,
      type: type,
      audioBlob: file,
      date: new Date().toLocaleString("es-ES")
    });

    await loadLibrary();

    if (fileInput) fileInput.value = "";
    if (nameInput) nameInput.value = "";
    if (typeSelect) typeSelect.value = "pista";

    alert("✅ Archivo guardado en Biblioteca");
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo guardar el archivo");
  }
}

async function loadTrackOptionsInStudio() {
  const select = $("studioTrackSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecciona una pista desde Biblioteca</option>`;

  try {
    const tracks = await getLibraryItemsByType("pista");

    if (!tracks.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No hay pistas guardadas";
      select.appendChild(option);
      return;
    }

    tracks.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} (${item.date || "sin fecha"})`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadSelectedTrackFromLibraryStudio() {
  const select = $("studioTrackSelect");
  const player = $("player");
  const status = $("studioStatus");

  if (!select || !player || !status) return;

  const selectedId = Number(select.value);

  if (!selectedId) {
    alert("⚠️ Selecciona una pista");
    return;
  }

  try {
    const item = await getLibraryItemById(selectedId);

    if (!item) {
      alert("⚠️ No se encontró la pista");
      return;
    }

    studioTrackFileName = item.name;
    player.src = URL.createObjectURL(item.audioBlob);
    status.textContent = `Estado: pista cargada desde Biblioteca (${item.name})`;
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo cargar la pista seleccionada");
  }
}

async function loadVoiceOptionsInStudio() {
  const select = $("voiceLibrarySelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecciona una voz guardada</option>`;

  try {
    const voces = await getLibraryItemsByType("voz");
    const grabaciones = await getLibraryItemsByType("grabacion");

    const merged = [...voces, ...grabaciones];

    if (!merged.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No hay voces guardadas";
      select.appendChild(option);
      return;
    }

    merged.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} (${item.date || "sin fecha"})`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadSelectedVoiceFromLibrary() {
  const select = $("voiceLibrarySelect");
  const player = $("selectedVoicePlayer");
  const status = $("selectedVoiceStatus");
  const lyricsText = $("lyricsText");

  if (!select || !player || !status) return;

  const selectedId = Number(select.value);

  if (!selectedId) {
    alert("⚠️ Selecciona una voz");
    return;
  }

  try {
    const item = await getLibraryItemById(selectedId);

    if (!item) {
      alert("⚠️ No se encontró el archivo");
      return;
    }

    selectedVoiceBlob = item.audioBlob;
    selectedVoiceId = item.id;

    const audioURL = URL.createObjectURL(item.audioBlob);
    player.src = audioURL;
    status.textContent = `Estado: voz seleccionada -> ${item.name}`;

    if (Array.isArray(item.transcription) && item.transcription.length > 0) {
      baseTranscriptionSegments = item.transcription.map(seg =>
        buildWordTimingFromSegment(seg)
      );

      // IMPORTANTE:
      // aquí respetamos exactamente las líneas guardadas
      transcriptionSegments = baseTranscriptionSegments;

      renderKaraokeLyrics(transcriptionSegments);
      cargarLetrasEnMonitor();

      if (lyricsText) {
        lyricsText.value = transcriptionSegments
          .map(seg => seg.text || "")
          .join("\n")
          .trim();
      }

      status.textContent = "Estado: Voz seleccionada (Letras cargadas de memoria ⚡)";
    } else {
      baseTranscriptionSegments = [];
      transcriptionSegments = [];

      renderKaraokeLyrics([]);
      cargarLetrasEnMonitor();

      if (lyricsText) lyricsText.value = "";
      status.textContent = `Estado: voz seleccionada -> ${item.name} (sin transcripción guardada)`;
    }
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo cargar la voz seleccionada");
  }
}

// ==========================================
// TRANSCRIPCIÓN CON TÉCNICA DE CHUNKING
// ==========================================
async function transcribeSelectedVoice() {
  if (!selectedVoiceBlob) {
    alert("⚠️ Primero selecciona y carga una voz desde Biblioteca");
    return;
  }

  const status = $("selectedVoiceStatus");
  const lyricsText = $("lyricsText");

  try {
    if (status) {
      status.textContent = "Estado: Preparando audio (cortando en porciones)...";
    }

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await selectedVoiceBlob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const CHUNK_SECONDS = 25;
    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = audioBuffer.length;
    const samplesPerChunk = CHUNK_SECONDS * sampleRate;

    let fullSegments = [];

    for (let start = 0; start < totalSamples; start += samplesPerChunk) {
      const end = Math.min(start + samplesPerChunk, totalSamples);
      const chunkNumber = Math.floor(start / samplesPerChunk) + 1;
      const totalChunks = Math.ceil(totalSamples / samplesPerChunk);

      if (status) {
        status.textContent = `Estado: Transcribiendo parte ${chunkNumber} de ${totalChunks}...`;
      }

      const wavBlob = audioBufferToWav(audioBuffer, start, end);
      const base64Audio = await blobToBase64(wavBlob);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64Audio })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      const palabrasProhibidas = [
        "Amara",
        "Subtítulos",
        "subtítulos",
        "Almorzo",
        "Suscribete",
        "comunidad"
      ];

      const timeOffset = start / sampleRate;

      (result.segments || []).forEach((seg) => {
        const segText = (seg?.text || "").trim();

        if (!segText) return;

        const esFantasma = palabrasProhibidas.some((palabra) =>
          segText.toLowerCase().includes(palabra.toLowerCase())
        );

        if (esFantasma) return;

        const segmentWithOffset = {
          start: Number(seg.start || 0) + timeOffset,
          end: Number(seg.end || 0) + timeOffset,
          text: segText
        };

        fullSegments.push(buildWordTimingFromSegment(segmentWithOffset));
      });
    }

    baseTranscriptionSegments = fullSegments;
    transcriptionSegments = splitSegmentsIntoKaraokeLines(baseTranscriptionSegments, 6);

    renderKaraokeLyrics(transcriptionSegments);
    cargarLetrasEnMonitor();

    if (lyricsText) {
      lyricsText.value = transcriptionSegments.map(line => line.text).join("\n");
    }

     // --- AQUÍ ESTÁ EL GUARDADO AUTOMÁTICO EN BIBLIOTECA ---
    if (selectedVoiceId) {
      try {
        await updateLibraryItem(selectedVoiceId, {
          transcription: baseTranscriptionSegments // Guardamos los tiempos y textos
        });
        console.log("✅ Transcripción guardada en Biblioteca");
      } catch (err) {
        console.error("❌ Error guardando transcripción en BD:", err);
      }
    }

    if (status) {
      status.textContent = "Estado: Transcripción completada y guardada ✅";
    }
  } catch (error) {
    console.error(error);
    alert("❌ Error al transcribir el audio.");
    if (status) status.textContent = "Estado: Error en la transcripción";
  }
}

// ==========================================
// FUNCIONES AUXILIARES AUDIO
// ==========================================
function audioBufferToWav(buffer, startSample, endSample) {
  const length = endSample - startSample;
  const wavBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wavBuffer);
  const sampleRate = buffer.sampleRate;

  const writeString = (viewObj, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      viewObj.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, length * 2, true);

  const channelData = buffer.getChannelData(0);
  let offset = 44;

  for (let i = startSample; i < endSample; i++) {
    let sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const base64String = reader.result.split(",")[1];
      resolve(base64String);
    };

    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildWordTimingFromSegment(segment) {
  const cleanText = (segment.text || "").trim();

  if (!cleanText) {
    return {
      ...segment,
      words: []
    };
  }

  const rawWords = cleanText.split(/\s+/).filter(Boolean);
  const segmentDuration = Math.max(0, (segment.end || 0) - (segment.start || 0));

  if (!rawWords.length || segmentDuration <= 0) {
    return {
      ...segment,
      words: rawWords.map(word => ({
        word,
        start: segment.start,
        end: segment.end
      }))
    };
  }

  const totalChars = rawWords.reduce((sum, word) => sum + word.length, 0) || rawWords.length;
  let cursor = segment.start;

  const timedWords = rawWords.map((word, index) => {
    const weight = word.length / totalChars;
    let duration = segmentDuration * weight;

    if (index === rawWords.length - 1) {
      duration = segment.end - cursor;
    }

    const wordStart = cursor;
    const wordEnd = cursor + duration;
    cursor = wordEnd;

    return {
      word,
      start: wordStart,
      end: wordEnd
    };
  });

  return {
    ...segment,
    words: timedWords
  };
}

function splitSegmentsIntoKaraokeLines(segments, maxWordsPerLine = 6) {
  const result = [];

  segments.forEach((segment) => {
    const words = Array.isArray(segment.words) && segment.words.length
      ? segment.words
      : buildWordTimingFromSegment(segment).words;

    if (!words.length) return;

    for (let i = 0; i < words.length; i += maxWordsPerLine) {
      const chunk = words.slice(i, i + maxWordsPerLine);
      if (!chunk.length) continue;

      result.push({
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        text: chunk.map(w => w.word).join(" "),
        words: chunk
      });
    }
  });

  return result;
}

function buildSegmentsFromMultilineLyrics(text, baseSegments) {
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length || !Array.isArray(baseSegments) || !baseSegments.length) {
    return [];
  }

  const totalStart = baseSegments[0].start;
  const totalEnd = baseSegments[baseSegments.length - 1].end;
  const totalDuration = Math.max(0, totalEnd - totalStart);

  if (totalDuration <= 0) return [];

  const lineWeights = lines.map(line => {
    const words = line.split(/\s+/).filter(Boolean);
    return words.reduce((sum, w) => sum + w.length, 0) || words.length || 1;
  });

  const totalWeight = lineWeights.reduce((a, b) => a + b, 0) || 1;

  let cursor = totalStart;

  return lines.map((line, index) => {
    let duration = totalDuration * (lineWeights[index] / totalWeight);

    if (index === lines.length - 1) {
      duration = totalEnd - cursor;
    }

    const segment = {
      start: cursor,
      end: cursor + duration,
      text: line
    };

    cursor += duration;
    return buildWordTimingFromSegment(segment);
  });
}

function renderKaraokeLyrics(segments) {
  const container = $("karaokeLyrics");
  if (!container) return;

  console.log("renderKaraokeLyrics -> segmentos:", segments);

  container.innerHTML = "";

  if (!Array.isArray(segments) || !segments.length) {
    container.innerHTML = `<p class="karaoke-placeholder">No hay segmentos para mostrar.</p>`;
    return;
  }

  segments.forEach((segment, index) => {
    const line = document.createElement("p");
    line.className = "karaoke-line";
    line.dataset.index = index;
    line.dataset.start = Number(segment.start || 0);
    line.dataset.end = Number(segment.end || 0);

    const words = Array.isArray(segment.words) ? segment.words : [];

    if (words.length) {
      words.forEach((wordObj, wordIndex) => {
        const span = document.createElement("span");
        span.className = "karaoke-word";
        span.dataset.start = Number(wordObj.start || 0);
        span.dataset.end = Number(wordObj.end || 0);
        span.textContent = (wordObj.word || "") + (wordIndex < words.length - 1 ? " " : "");
        line.appendChild(span);
      });
    } else {
      line.textContent = (segment.text || "").trim();
    }

    container.appendChild(line);
  });
}

function updateKaraokeHighlight(currentTime) {
  const lines = document.querySelectorAll(".karaoke-line");
  if (!lines.length) return;

  let activeLine = null;

  lines.forEach((line) => {
    const start = parseFloat(line.dataset.start);
    const end = parseFloat(line.dataset.end);

    line.classList.remove("active", "past", "upcoming");

    if (currentTime >= start && currentTime <= end) {
      line.classList.add("active");
      activeLine = line;
    } else if (currentTime > end) {
      line.classList.add("past");
    } else {
      line.classList.add("upcoming");
    }

    const words = line.querySelectorAll(".karaoke-word");
    words.forEach((word) => {
      const wordStart = parseFloat(word.dataset.start);
      const wordEnd = parseFloat(word.dataset.end);

      word.classList.remove("active-word", "past-word");

      if (currentTime >= wordStart && currentTime <= wordEnd) {
        word.classList.add("active-word");
      } else if (currentTime > wordEnd) {
        word.classList.add("past-word");
      }
    });
  });

  if (activeLine) {
    activeLine.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

// ==========================================
// KARAOKE
// ==========================================
let karaokeMediaRecorder = null;
let karaokeStream = null;
let karaokeChunks = [];
let karaokeRecordedBlob = null;
let karaokeSelectedTrackBlob = null;
let karaokeSelectedTrackName = "Pista";
let lastActiveLine = null;

function cargarPistaKaraoke(e) {
  const file = e.target.files[0];
  if (!file) return;

  karaokeSelectedTrackBlob = file;
  karaokeSelectedTrackName = file.name;

  const track = $("karaokeTrack");
  track.src = URL.createObjectURL(file);
  track.volume = 0.4;

  $("karaokeStatus").textContent = "Estado: Pista lista. ¡Presiona Iniciar Grabación!";
  cargarLetrasEnMonitor();
}

async function loadTrackOptionsInKaraoke() {
  const select = $("karaokeTrackSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecciona una pista desde tu Biblioteca</option>`;

  try {
    const pistas = await getLibraryItemsByType("pista");

    if (!pistas.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No hay pistas guardadas";
      select.appendChild(option);
      return;
    }

    pistas.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadSelectedTrackFromLibraryKaraoke() {
  const select = $("karaokeTrackSelect");
  const id = Number(select.value);

  if (!id) {
    alert("⚠️ Selecciona una pista de la lista.");
    return;
  }

  try {
    const item = await getLibraryItemById(id);
    if (!item) return;

    karaokeSelectedTrackBlob = item.audioBlob;
    karaokeSelectedTrackName = item.name;

    const track = $("karaokeTrack");
    track.src = URL.createObjectURL(item.audioBlob);
    track.volume = 0.4;

    $("karaokeStatus").textContent = `Estado: Pista cargada (${item.name}). ¡Inicia grabación!`;
    cargarLetrasEnMonitor();
  } catch (error) {
    console.error(error);
    alert("❌ Error al cargar la pista.");
  }
}

function cargarLetrasEnMonitor() {
  const container = $("karaokeLiveLyrics");
  if (!container) return;

  console.log("cargarLetrasEnMonitor -> transcriptionSegments:", transcriptionSegments);

  container.innerHTML = "";

  if (!Array.isArray(transcriptionSegments) || transcriptionSegments.length === 0) {
    container.innerHTML = `<p class="karaoke-placeholder" style="font-size:18px;">⚠️ Ve a la pestaña 'Estudio', transcribe una voz y vuelve aquí para ver la letra.</p>`;
    return;
  }

  transcriptionSegments.forEach((seg) => {
    const p = document.createElement("p");
    p.className = "karaoke-live-line";
    p.dataset.start = Number(seg.start || 0);
    p.dataset.end = Number(seg.end || 0);

    const words = Array.isArray(seg.words) ? seg.words : [];

    if (words.length) {
      words.forEach((wordObj, index) => {
        const span = document.createElement("span");
        span.className = "karaoke-live-word";
        span.dataset.start = Number(wordObj.start || 0);
        span.dataset.end = Number(wordObj.end || 0);
        span.textContent = (wordObj.word || "") + (index < words.length - 1 ? " " : "");
        p.appendChild(span);
      });
    } else {
      p.textContent = (seg.text || "").trim();
    }

    container.appendChild(p);
  });
}

async function startKaraokeRecording() {
    const track = $("karaokeTrack");

    if (!track || !track.src) {
        alert("⚠️ Primero sube una pista instrumental en el Paso 1.");
        return;
    }

    try {
        karaokeChunks = [];
        karaokeRecordedBlob = null;
        $("karaokeVoicePlayer").src = "";

        karaokeStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1,
                sampleRate: 48000
            }
        });

        const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? { mimeType: "audio/webm;codecs=opus" }
            : {};

        karaokeMediaRecorder = new MediaRecorder(karaokeStream, options);

        karaokeMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) karaokeChunks.push(e.data);
        };

        karaokeMediaRecorder.onstop = () => {
            karaokeRecordedBlob = new Blob(karaokeChunks, { type: "audio/webm" });
            $("karaokeVoicePlayer").src = URL.createObjectURL(karaokeRecordedBlob);
            $("karaokeStatus").textContent = "Estado: Grabación finalizada ✅";
        };

        karaokeMediaRecorder.start();
        track.currentTime = 0;
        track.play();

        // ¡AQUÍ ACTIVAMOS EL MONITOR!
        startKaraokePitchDetection();

        $("karaokeStatus").textContent = "Estado: 🔴 Grabando y reproduciendo pista...";
        $("karaokeStartBtn").disabled = true;

    } catch (err) {
        console.error(err);
        alert("❌ Error al acceder al micrófono.");
    }
}

function stopKaraokeRecording() {
  if (karaokeMediaRecorder && karaokeMediaRecorder.state !== "inactive") {
    karaokeMediaRecorder.stop();
  }

  if (karaokeStream) {
    karaokeStream.getTracks().forEach(t => t.stop());
  }

  const track = $("karaokeTrack");
  if (track) track.pause();

  $("karaokeStartBtn").disabled = false;
}

function restartKaraokeRecording() {
  const track = $("karaokeTrack");

  if (track) {
    track.pause();
    track.currentTime = 0;
  }

  $("karaokeVoicePlayer").src = "";
  karaokeChunks = [];
  karaokeRecordedBlob = null;
  $("karaokeStatus").textContent = "Estado: Esperando para grabar...";
  $("karaokeStartBtn").disabled = false;
}

function syncKaraokeMonitor(currentTime) {
  const lines = document.querySelectorAll(".karaoke-live-line");
  if (!lines.length) return;

  let activeLine = null;

  lines.forEach(line => {
    const start = parseFloat(line.dataset.start);
    const end = parseFloat(line.dataset.end) + 1.5;

    line.classList.remove("active", "past");

    if (currentTime >= start && currentTime <= end) {
      line.classList.add("active");
      activeLine = line;
    } else if (currentTime > end) {
      line.classList.add("past");
    }

    const words = line.querySelectorAll(".karaoke-live-word");
    words.forEach(word => {
      const wordStart = parseFloat(word.dataset.start);
      const wordEnd = parseFloat(word.dataset.end);

      word.classList.remove("active-word", "past-word");

      if (currentTime >= wordStart && currentTime <= wordEnd) {
        word.classList.add("active-word");
      } else if (currentTime > wordEnd) {
        word.classList.add("past-word");
      }
    });
  });

  if (activeLine && activeLine !== lastActiveLine) {
    activeLine.scrollIntoView({ behavior: "smooth", block: "center" });
    lastActiveLine = activeLine;
  }
}

async function mixKaraoke() {
  if (!karaokeSelectedTrackBlob || !karaokeRecordedBlob) {
    alert("⚠️ Faltan ingredientes: Asegúrate de cargar una pista instrumental y grabar tu voz primero.");
    return;
  }

  const trackFile = karaokeSelectedTrackBlob;
  const btn = $("karaokeMixBtn");
  const resultDiv = $("karaokeMixResult");

  btn.textContent = "🎧 Mezclando audios... ⏳";
  btn.disabled = true;
  resultDiv.innerHTML = "<p style='color: var(--text-muted);'>Uniendo la pista y tu voz. Esto puede tardar unos segundos...</p>";

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const trackArrayBuffer = await trackFile.arrayBuffer();
    const trackBuffer = await audioCtx.decodeAudioData(trackArrayBuffer);

    const voiceArrayBuffer = await karaokeRecordedBlob.arrayBuffer();
    const voiceBuffer = await audioCtx.decodeAudioData(voiceArrayBuffer);

    const offlineCtx = new OfflineAudioContext(
      trackBuffer.numberOfChannels,
      trackBuffer.length,
      trackBuffer.sampleRate
    );

    const trackGain = offlineCtx.createGain();
    trackGain.gain.value = 0.4;

    const trackSource = offlineCtx.createBufferSource();
    trackSource.buffer = trackBuffer;
    trackSource.connect(trackGain);
    trackGain.connect(offlineCtx.destination);

    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.value = 2.5;

    const voiceSource = offlineCtx.createBufferSource();
    voiceSource.buffer = voiceBuffer;
    voiceSource.connect(voiceGain);
    voiceGain.connect(offlineCtx.destination);

    trackSource.start(0);
    voiceSource.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    const finalWavBlob = exportStereoWav(renderedBuffer);
    const finalUrl = URL.createObjectURL(finalWavBlob);

    resultDiv.innerHTML = `
      <h4 style="color: #22c55e;">✅ ¡Mezcla completada!</h4>
      <audio controls src="${finalUrl}" style="width: 100%; margin-bottom: 15px; border-radius: 8px;"></audio>
      <div style="display: flex; gap: 10px;">
        <a href="${finalUrl}" download="Mezcla_${trackFile.name || "Karaoke"}.wav" style="flex: 1;">
          <button type="button" style="width: 100%; background: #22c55e; color: black;">💾 Descargar Archivo</button>
        </a>
        <button id="saveMixToLibBtn" type="button" style="flex: 1; background: #3b82f6; color: white;">📁 Guardar en Biblioteca</button>
      </div>
    `;

    $("saveMixToLibBtn").onclick = async () => {
      const btnSave = $("saveMixToLibBtn");
      btnSave.textContent = "Guardando...";
      btnSave.disabled = true;

      await saveToLibrary(finalWavBlob, {
        name: `Mezcla - ${trackFile.name || "Canción"}`,
        type: "grabacion"
      });

      btnSave.textContent = "✅ ¡Guardado en Biblioteca!";
    };
  } catch (err) {
    console.error("Error al mezclar:", err);
    resultDiv.innerHTML = "<p style='color: #ef4444;'>❌ Hubo un error al mezclar los audios.</p>";
  } finally {
    btn.textContent = "🎧 Mezclar Pista + Voz";
    btn.disabled = false;
  }
}

function exportStereoWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const result = new ArrayBuffer(length);
  const view = new DataView(result);
  const channels = [];
  let pos = 0;

  const writeString = (viewObj, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      viewObj.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + buffer.length * 2 * numOfChan, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2 * numOfChan, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, buffer.length * 2 * numOfChan, true);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  pos = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      let sample = Math.max(-1, Math.min(1, channels[channel][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
  }

  return new Blob([result], { type: "audio/wav" });
}

// ==========================================
// SPLITTER IA
// ==========================================
async function splitAudio() {
  const fileInput = $("splitterFile");
  const file = fileInput?.files[0];

  if (!file) {
    alert("⚠️ Selecciona una canción primero.");
    return;
  }

  const btn = $("splitBtn");
  const statusBox = $("splitterStatusBox");
  const statusText = $("splitterStatusText");
  const detailText = $("splitterDetailText");

  btn.disabled = true;
  statusBox.style.display = "block";
  statusText.textContent = "1/4 📦 Subiendo canción...";
  detailText.textContent = "Enviando al casillero temporal seguro...";

  try {
    const formData = new FormData();
    formData.append("file", file);

    const tmpResponse = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: formData
    });

    const tmpData = await tmpResponse.json();
    if (!tmpData.data || !tmpData.data.url) {
      throw new Error("Error al subir al casillero temporal.");
    }

    const directUrl = tmpData.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");

    statusText.textContent = "2/4 🚀 Iniciando Inteligencia Artificial...";
    detailText.textContent = "Despertando al modelo de alta calidad MDX23...";

    const startResponse = await fetch("/api/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl: directUrl })
    });

    const prediction = await startResponse.json();
    if (!startResponse.ok) {
      throw new Error(prediction.error || "Error al conectar con Replicate");
    }

    statusText.textContent = "3/4 ⏳ IA separando pistas...";

    const interval = setInterval(async () => {
      try {
        const checkResponse = await fetch(`/api/split?id=${prediction.id}`);
        const statusData = await checkResponse.json();

        if (statusData.status === "succeeded") {
          clearInterval(interval);

          statusText.textContent = "4/4 🎧 Armando la pista final...";
          detailText.textContent = "Mezclando bajo, batería y melodía en una sola pista instrumental...";

          const urls = statusData.output;
          let vocalUrl = null;
          let instUrls = [];

          if (Array.isArray(urls)) {
            urls.forEach(u => u.toLowerCase().includes("vocal") ? (vocalUrl = u) : instUrls.push(u));
            if (!vocalUrl) {
              vocalUrl = urls[0];
              instUrls = urls.slice(1);
            }
          } else {
            for (const [key, value] of Object.entries(urls)) {
              if (key.toLowerCase().includes("vocal")) vocalUrl = value;
              else instUrls.push(value);
            }
          }

          const resVoz = await fetch(vocalUrl);
          const blobVoz = await resVoz.blob();

          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const buffers = [];

          for (const url of instUrls) {
            const res = await fetch(url);
            const arrayBuffer = await res.arrayBuffer();
            buffers.push(await audioCtx.decodeAudioData(arrayBuffer));
          }

          const maxLength = Math.max(...buffers.map(b => b.length));
          const offlineCtx = new OfflineAudioContext(2, maxLength, buffers[0].sampleRate);

          buffers.forEach(buffer => {
            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(offlineCtx.destination);
            source.start(0);
          });

          const renderedBuffer = await offlineCtx.startRendering();
          const blobPista = exportStereoWav(renderedBuffer);

          await saveToLibrary(blobVoz, { name: `Voz - ${file.name}`, type: "voz" });
          await saveToLibrary(blobPista, { name: `Pista - ${file.name}`, type: "pista" });

          statusText.textContent = "🎉 ¡Separación perfecta!";
          detailText.textContent = "Voz pura y Pista Instrumental guardadas en Biblioteca.";
          btn.disabled = false;
          btn.textContent = "✨ Separar Otra Canción";
        } else if (statusData.status === "failed" || statusData.status === "canceled") {
          clearInterval(interval);
          throw new Error("La IA falló al procesar el audio.");
        } else {
          detailText.textContent = `Estado de la IA: ${statusData.status}... por favor espera.`;
        }
      } catch (pollError) {
        clearInterval(interval);
        console.error(pollError);
        statusText.textContent = "❌ Error detectado";
        detailText.textContent = pollError.message || "Revisa la consola para más detalles.";
        btn.disabled = false;
        btn.textContent = "✨ Separar Audio con IA";
      }
    }, 4000);
  } catch (err) {
    console.error(err);
    statusText.textContent = "❌ Error detectado";
    detailText.textContent = err.message || "Revisa la consola para más detalles.";
    btn.disabled = false;
    btn.textContent = "✨ Separar Audio con IA";
  }
}

function showResult(url) {
  let container = document.getElementById("splitResult");

  if (!container) {
    container = document.createElement("div");
    container.id = "splitResult";
    container.style.marginTop = "20px";
    document.getElementById("splitter").appendChild(container);
  }

  container.innerHTML = `
    <p>✅ API respondió correctamente</p>
    <audio controls src="${url}"></audio>
    <br><br>
    <a href="${url}" download="resultado.mp3">
      <button>Descargar</button>
    </a>
  `;
}

// ==========================================
// CONFIGURACIÓN
// ==========================================
function saveSetting(key, element) {
  if (!element) return;
  localStorage.setItem(key, element.value);
  showSaveNotification();
}

function initSettings() {
  const settings = {
    micCount: "vocalApp_micCount",
    karaokeStage: "vocalApp_stage",
    difficultyLevel: "vocalApp_difficulty",
    userVoiceType: "vocalApp_voiceType" // Nueva clave
  };

  Object.entries(settings).forEach(([id, storageKey]) => {
    const el = $(id);
    if (el) {
      // Cargar valor guardado
      const saved = localStorage.getItem(storageKey);
      if (saved) el.value = saved;
      
      // Escuchar cambios
      el.addEventListener("change", (e) => {
        localStorage.setItem(storageKey, e.target.value);
        showSaveNotification();
      });
    }
  });
}

function showSaveNotification() {
  const notif = $("saveNotification");
  if (!notif) return;

  notif.classList.add("show");

  setTimeout(() => {
    notif.classList.remove("show");
  }, 2000);
}

async function applyCorrectedLyrics() {
  const lyricsText = $("lyricsText");
  const status = $("selectedVoiceStatus");

  if (!lyricsText) return;

  const correctedText = lyricsText.value.trim();

  if (!correctedText) {
    alert("⚠️ No hay texto corregido para aplicar.");
    return;
  }

  if (!Array.isArray(baseTranscriptionSegments) || !baseTranscriptionSegments.length) {
    alert("⚠️ Primero transcribe una voz antes de corregir la letra.");
    return;
  }

  const rebuiltSegments = buildSegmentsFromMultilineLyrics(
    correctedText,
    baseTranscriptionSegments
  );

  if (!rebuiltSegments.length) {
    alert("⚠️ No se pudo reconstruir la letra corregida.");
    return;
  }

  // Guardamos como nueva base la versión corregida
  baseTranscriptionSegments = rebuiltSegments;

  // Mostramos exactamente las líneas escritas por el usuario
  transcriptionSegments = rebuiltSegments;

  renderKaraokeLyrics(transcriptionSegments);
  cargarLetrasEnMonitor();

  lyricsText.value = transcriptionSegments
    .map(seg => seg.text || "")
    .join("\n")
    .trim();

  if (selectedVoiceId) {
    try {
      await updateLibraryItem(selectedVoiceId, {
        transcription: baseTranscriptionSegments
      });

      if (status) {
        status.textContent = "Estado: letra corregida aplicada y guardada ✅";
      }
    } catch (error) {
      console.error(error);
      if (status) {
        status.textContent = "Estado: letra corregida aplicada, pero no se pudo guardar en BD";
      }
    }
  } else {
    if (status) {
      status.textContent = "Estado: letra corregida aplicada ✅";
    }
  }
}
// ==========================================
// INIT
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initDB();
    initSettings();

    function applyKaraokeTheme() {
      const theme = localStorage.getItem("vocalApp_stage") || "clasico";
      const monitor = $("karaokeLiveLyrics");
      if (monitor) {
        monitor.className = "karaoke-lyrics theme-" + theme;
      }
    }

    applyKaraokeTheme();

    safeAdd("karaokeStage", "change", (e) => {
      saveSetting("vocalApp_stage", e.target);
      applyKaraokeTheme();
    });

    // navegación
    safeAdd("btnAfinador", "click", () => showTab("afinador"));
    safeAdd("btnEstudio", "click", () => showTab("estudio"));
    safeAdd("btnBiblioteca", "click", () => showTab("biblioteca"));
    safeAdd("btnKaraoke", "click", () => showTab("karaoke"));
    safeAdd("btnSplitter", "click", () => showTab("splitter"));
    safeAdd("btnConfig", "click", () => showTab("config"));

    // afinador
    safeAdd("recordBtn", "click", toggleRecording);

    // estudio
    safeAdd("audioFile", "change", cargarAudioEstudio);
    safeAdd("refreshStudioTrackListBtn", "click", loadTrackOptionsInStudio);
    safeAdd("loadStudioTrackBtn", "click", loadSelectedTrackFromLibraryStudio);
    safeAdd("playTrackBtn", "click", playTrack);
    safeAdd("pauseTrackBtn", "click", pauseTrack);
    safeAdd("stopTrackBtn", "click", stopTrack);
    safeAdd("startStudioRecBtn", "click", startStudioRecording);
    safeAdd("stopStudioRecBtn", "click", stopStudioRecording);
    safeAdd("redoStudioRecBtn", "click", redoStudioRecording);
    safeAdd("saveStudioRecBtn", "click", saveStudioRecording);
    safeAdd("refreshVoiceListBtn", "click", loadVoiceOptionsInStudio);
    safeAdd("loadSelectedVoiceBtn", "click", loadSelectedVoiceFromLibrary);
    safeAdd("transcribeVoiceBtn", "click", transcribeSelectedVoice);
    safeAdd("applyCorrectedLyricsBtn", "click", applyCorrectedLyrics);

    // biblioteca
    safeAdd("saveLibraryFileBtn", "click", saveManualFileToLibrary);

    // karaoke
    safeAdd("karaokeTrackFile", "change", cargarPistaKaraoke);
    safeAdd("karaokeStartBtn", "click", startKaraokeRecording);
    safeAdd("karaokeStopBtn", "click", stopKaraokeRecording);
    safeAdd("karaokeRestartBtn", "click", restartKaraokeRecording);
    safeAdd("karaokeMixBtn", "click", mixKaraoke);
    safeAdd("refreshKaraokeTrackBtn", "click", loadTrackOptionsInKaraoke);
    safeAdd("loadKaraokeTrackBtn", "click", loadSelectedTrackFromLibraryKaraoke);

    const kTrack = $("karaokeTrack");
    if (kTrack) {
      kTrack.addEventListener("timeupdate", () => {
        syncKaraokeMonitor(kTrack.currentTime);
      });
    }

    // splitter
    safeAdd("splitBtn", "click", splitAudio);

    // init
    await renderLibrary('todos');
    await loadTrackOptionsInStudio();
    await loadTrackOptionsInKaraoke();

    const player = $("player");
    if (player) {
      player.addEventListener("timeupdate", () => {
        updateKaraokeHighlight(player.currentTime);
      });

      player.addEventListener("ended", () => {
        updateKaraokeHighlight(player.currentTime);
      });
    }
  } catch (error) {
    console.error(error);
    alert("❌ Error inicializando la app");
  }
});

// ==========================================
// MONITOR DE KARAOKE (CANVAS)
// ==========================================
function drawKaraokeMonitor(currentTime, currentFreq) {
    const canvas = $("karaokeCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Guardamos la frecuencia actual en el historial
    pitchHistory.push(currentFreq > 0 ? currentFreq : null);
    if (pitchHistory.length > canvas.width / 5) pitchHistory.shift();

    // Limpiamos el canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    / --- NUEVO: Dibujar Barras Objetivo (Sustituye tu bucle anterior) ---
    if (typeof transcriptionSegments !== 'undefined') {
        transcriptionSegments.forEach((seg, index) => {
            const x = (seg.start - currentTime) * 30 + (canvas.width / 4);
            const width = Math.max((seg.end - seg.start) * 30, 50);

            if (x > -width && x < canvas.width) {
                // Posición vertical según el nivel
                const nivel = index % 4; 
                const targetY = 50 + (nivel * 40); 

                // 1. Dibujar Barra Azul
                ctx.fillStyle = "#3b82f6";
                ctx.fillRect(x, targetY, width, 30);

                // 2. DIBUJAR LETRA
                ctx.fillStyle = "white";
                ctx.font = "bold 14px Arial";
                ctx.textAlign = "center";
                ctx.fillText(seg.text || "", x + width / 2, targetY + 20);

                // 3. LÓGICA DE AFINACIÓN (SUBE/BAJA)
                if (currentFreq > 0) {
                    const vozY = canvas.height - (Math.log2(currentFreq / 110) * 35);
                    
                    // Si la voz está muy lejos de la barra azul
                    if (vozY < targetY - 20) {
                        ctx.fillStyle = "orange";
                        ctx.fillText("BAJA ⬇️", x + width / 2, targetY - 10);
                    } else if (vozY > targetY + 50) {
                        ctx.fillStyle = "orange";
                        ctx.fillText("SUBE ⬆️", x + width / 2, targetY + 50);
                    }
                }
            }
        });
    }
    } else {
        // Si no hay segmentos, mostramos un mensaje
        ctx.fillStyle = "#666";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Carga una voz transcrita en 'Estudio' primero", canvas.width / 2, 100);
    }

    // --- DIBUJAR LÍNEAS DEL PENTAGRAMA ---
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (canvas.height / 4) * i);
        ctx.lineTo(canvas.width, (canvas.height / 4) * i);
        ctx.stroke();
    }

    // --- DIBUJAR RASTRO DE LA VOZ (LÍNEA VERDE) ---
    ctx.beginPath();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 4;

    pitchHistory.forEach((f, i) => {
        if (f) {
            const rawY = canvas.height - (Math.log2(f / 110) * 35);
            const y = Math.max(10, Math.min(canvas.height - 10, rawY));

            if (i === 0) ctx.moveTo(i * 5, y);
            else ctx.lineTo(i * 5, y);
        }
    });
    ctx.stroke();
}

// ==========================================
// DETECCIÓN DE PITCH PARA KARAOKE
// ==========================================
async function startKaraokePitchDetection() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mic = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    mic.connect(analyser);

    function loop() {
        const track = $("karaokeTrack");
        const currentTime = track ? track.currentTime : 0;

        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        const pitch = autoCorrelate(buffer, audioCtx.sampleRate);

        drawKaraokeMonitor(currentTime, pitch);

        // Si la pista terminó, paramos
        if (track && track.ended) return;

        // Seguimos el loop mientras se graba
        if (karaokeMediaRecorder && karaokeMediaRecorder.state === "recording") {
            requestAnimationFrame(loop);
        }
    }

    loop();
}
