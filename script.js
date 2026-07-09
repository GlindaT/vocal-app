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

let db;
let pitchHistory = [];
let transcriptionSegments = [];
let baseTranscriptionSegments = [];
let textSegments = [];
let baseTextSegments = [];
let autoScrollEnabled = true; // Control de auto-scroll

// Variables para sincronización con Taps
let tapSyncMode = false;
let tapSyncLines = [];
let tapSyncTimestamps = [];
let tapSyncCurrentIndex = 0;
let tapSyncParts = [];           // Parte ("P1" | "P2" | "DUO") asignada a cada tap
let currentTapPart = "P1";       // Parte activa durante la sincronización

// Estado del Monitor Dúo Split (canvas dividido)
let karaokeDuoSplitMode = false;
let karaokePitchP1 = -1;         // Pitch detectado del Mic 1 (P1)
let karaokePitchP2 = -1;         // Pitch detectado del Mic 2 (P2)
let pitchHistoryP1 = [];         // Rastro de voz P1
let pitchHistoryP2 = [];         // Rastro de voz P2
let karaokeSplitStream1 = null;
let karaokeSplitStream2 = null;
let karaokeSplitAudioCtx = null;
let karaokeSplitAnalyser1 = null;
let karaokeSplitAnalyser2 = null;

function $(id) {
  return document.getElementById(id);
}

function safeAdd(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

document.addEventListener("DOMContentLoaded", async () => {
  const encabezados = document.querySelectorAll('.encabezado-desplegable');
  
  encabezados.forEach(encabezado => {
    encabezado.addEventListener('click', () => {
      const targetId = encabezado.getAttribute('data-target');
      const arrowId = encabezado.getAttribute('data-arrow');
      
      const content = document.getElementById(targetId);
      const arrow = document.getElementById(arrowId);
      
      if (content && arrow) {
        content.classList.toggle('oculto'); 
        arrow.classList.toggle('rotada');
      }
    });
  });
});

//import { supabase } from './supabase-config.js'; 

// ==========================================
// INDEXED DB - BIBLIOTECA
// ==========================================
function initSupabase() {
  return new Promise((resolve, reject) => {
    // Verificamos si tu configuración de supabase-config.js cargó bien
    if (typeof supabaseApp !== "undefined") {
      db = supabaseApp; // Guardamos el cliente en nuestra variable 'db'
      console.log("🚀 Base de datos Supabase conectada con éxito");
      resolve(db);
    } else {
      reject("❌ Error: No se encontró 'supabaseApp'. Revisa tu archivo supabase-config.js");
    }
  });
}

/*function initSupabase() {
  return new Promise((resolve, reject) => {
    // 1. Abrimos la base de datos (nombre, versión)
    const request = database.open("vocalApp", 1);

    // Se ejecuta si la versión cambia o es la primera vez
    request.onupgradeneeded = function (event) {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("library")) {
        // Creamos el almacén de objetos (como una tabla)
        const store = database.createObjectStore("library", {
          keyPath: "id",
          autoIncrement: true
        });

        // Creamos índices para hacer búsquedas eficientes
        store.createIndex("type", "type", { unique: false });
        store.createIndex("date", "date", { unique: false });
      }
    };

    // Si todo sale bien
    request.onsuccess = function (event) {
      db = event.target.result; // Asignamos a la variable previamente declarada
      resolve(supabase);
    };

    // Si hay un error, pasamos el detalle del error
    request.onerror = function (event) {
      reject(`❌ Error al abrir Supabase: ${event.target.error}`);
    };
  });
}
*/

async function addLibraryItemToSupabase(item) {
  if (!db) {
    throw new Error("❌ La base de datos no está inicializada.");
  }

  try {
    // Insertamos el ítem. Supabase autogenera el ID.
    const { data, error } = await db
      .from('library')
      .insert([item])
      .select(); // El .select() nos permite recuperar el ID generado

    if (error) throw new Error(error.message);

    const newId = data[0]?.id;
    console.log("✅ Ítem guardado con éxito en la nube, ID:", newId);
    return newId; 
  } catch (error) {
    console.error("❌ Error al guardar:", error.message);
    throw error;
  }
}

async function getAllLibraryItemsFromSupabase() {
  // 1. Verificación de seguridad
  if (!db) {
    throw new Error("❌ No hay conexión con la base de datos.");
  }

  try {
    // 2. Solicitamos todos los objetos de la tabla 'library'
    const { data, error } = await db
      .from('library')
      .select('*'); // El asterisco trae todas las filas y columnas

    // 3. Si Supabase devuelve un error, lo manejamos
    if (error) {
      throw new Error(`❌ Error al leer la Biblioteca: ${error.message}`);
    }

    // 4. Resolvemos con el array de resultados
    console.log(`✅ Se recuperaron ${data.length} elementos desde Supabase.`);
    return data;

  } catch (error) {
    console.error(error.message);
    throw error; 
  }
}


async function updateLibraryItemFromSupabase(id, changes) {
  if (!db) {
    throw new Error("❌ Error: Base de datos no inicializada.");
  }

  try {
    // En Supabase no hace falta leer y fusionar manualmente.
    // .update() modifica solo las columnas que envíes en 'changes'.
    const { data, error } = await db
      .from('library')
      .update(changes)
      .eq('id', id)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error(`❌ No se encontró el ítem con ID: ${id}`);
    }

    console.log("✅ Registro actualizado con éxito en Supabase");
    return data[0]; // Devolvemos el objeto actualizado de la nube
  } catch (error) {
    console.error(error.message);
    throw error;
  }
}

async function deleteLibraryItemFromSupabase(id) {
  if (!db) {
    throw new Error("❌ No hay conexión con la base de datos.");
  }

  try {
    const { error } = await db
      .from('library')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    console.log(`✅ Registro con ID ${id} eliminado de Supabase.`);
  } catch (error) {
    console.error("❌ Error al eliminar el registro:", error.message);
    throw error;
  }
}

async function getLibraryItemsByTypeFromSupabase(type) {
  // 1. Validación de la base de datos
  if (!db) {
    throw new Error("❌ La base de datos no está disponible.");
  }

  try {
    // 2. Hacemos la consulta a Supabase filtrando por la columna 'type'
    const { data, error } = await db
      .from('library')       // Nombre de tu tabla
      .select('*')           // Selecciona todas las columnas
      .eq('type', type);     // Filtra donde la columna 'type' coincida con el argumento

    // 3. Si Supabase devuelve un error (ej. la tabla no existe)
    if (error) {
      throw new Error(`❌ Error de Supabase: ${error.message}`);
    }

    // 4. Mostramos el resultado en consola y lo retornamos
    console.log(`🔍 Buscando '${type}': se encontraron ${data.length} coincidencias.`);
    return data;

  } catch (error) {
    console.error(error.message);
    throw error; 
  }
}

async function getLibraryItemByIdFromSupabase(id) {
  if (!db) {
    throw new Error("❌ Error: La base de datos no está inicializada.");
  }

  try {
    const { data, error } = await db
      .from('library')
      .select('*')
      .eq('id', id)
      .single(); // .single() devuelve un objeto directo en vez de un array

    if (error) throw new Error(error.message);
    if (!data) throw new Error(`❌ No se encontró ningún elemento con el ID: ${id}`);

    return data;
  } catch (error) {
    console.error(error.message);
    throw error;
  }
}

//Agregado Supabase 04/07/2026

async function uploadFileToSupabase(fileOrBlob, fileName, mimeType = "application/octet-stream") {
  if (!db) throw new Error("❌ La base de datos no está inicializada.");

  // 1. Limpiamos el nombre original quitando tildes y caracteres prohibidos
  let cleanName = fileName
    .normalize("NFD") // Descompone caracteres con tildes (ej: ó -> o + ´)
    .replace(/[\u0300-\u036f]/g, "") // Borra los acentos/tildes dejando la letra limpia
    .replace(/[^a-zA-Z0-9._]/g, "_") // Reemplaza guiones, espacios y símbolos por guiones bajos
    .replace(/__+/g, "_"); // Si quedan guiones bajos dobles (如 __), los reduce a uno solo

  // 2. Le pegamos el número de seguridad al inicio (Esto evita duplicados)
  const safePath = `${Date.now()}_${cleanName}`;

  console.log(`📤 Subiendo archivo con nombre limpio seguro: ${safePath}`);

  // 3. Subida oficial al Storage de Supabase
  const { error: uploadError } = await db.storage
    .from("library") 
    .upload(safePath, fileOrBlob, {
      contentType: mimeType,
      upsert: false
    });

  if (uploadError) throw uploadError;

  // 4. Obtenemos la URL pública para guardarla en tu tabla
  const { data } = db.storage
    .from("library")
    .getPublicUrl(safePath);

  return {
    filePath: safePath,
    fileUrl: data.publicUrl
  };
}


async function saveLibraryItemToSupabase({ name, type, blob, transcription = [], metadata = {} }) {
  if (!db) throw new Error("❌ La base de datos no está inicializada.");

  const mimeType = blob.type || "application/octet-stream";
  const extension = mimeType.includes("wav")
    ? "wav"
    : mimeType.includes("mpeg")
    ? "mp3"
    : mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("ogg")
    ? "ogg"
    : "bin";

  // 1. OPTIMIZACIÓN DE SEGURIDAD: Limpiamos el nombre de tildes, espacios y caracteres raros
  let cleanName = name
    .normalize("NFD") // Separa las tildes de las letras
    .replace(/[\u0300-\u036f]/g, "") // Borra los acentos completamente
    .replace(/[^a-zA-Z0-9._]/g, "_") // Cambia espacios, guiones y símbolos por guiones bajos
    .replace(/__+/g, "_"); // Reduce múltiples guiones bajos seguidos a uno solo

  const fileName = `${cleanName}.${extension}`;

  console.log(`📤 Nombre original: "${name}" -> Generando archivo seguro: "${fileName}"`);

  // 2. Subimos el binario al Storage de Supabase
  const { filePath, fileUrl } = await uploadFileToSupabase(blob, fileName, mimeType);

  // 3. Insertamos la referencia en tu tabla 'library'
  // CORRECCIÓN: Quitamos la columna 'mime_type' para que no choque si la borraste en el panel web
  const { error } = await db
    .from("library") 
    .insert([
      {
        name, // Aquí conservamos el nombre bonito con tildes para mostrarlo en la interfaz de la app
        type,
        file_path: filePath, // Almacena la ruta limpia con la marca de tiempo (timestamp)
        file_url: fileUrl,   // Almacena el enlace público web directo
        transcription,
        metadata,
        date: new Date().toISOString()
      }
    ]);

  if (error) throw error;
}

/*
async function getAllLibraryItemsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("library_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function getLibraryItemsByTypeFromSupabase(type) {
  const { data, error } = await supabaseClient
    .from("library_items")
    .select("*")
    .eq("type", type)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function getLibraryItemByIdFromSupabase(id) {
  const { data, error } = await supabaseClient
    .from("library_items")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function deleteLibraryItemFromSupabase(id) {
  // primero buscamos el item para saber qué archivo borrar
  const item = await getLibraryItemByIdFromSupabase(id);

  if (item?.file_path) {
    const { error: storageError } = await supabaseClient.storage
      .from("library")
      .remove([item.file_path]);

    if (storageError) {
      console.warn("No se pudo borrar el archivo del storage:", storageError.message);
    }
  }

  const { error } = await supabaseClient
    .from("library_items")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
*/

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
    cambiarTono: "btnCambiarTono",
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
      echoCancellation: { exact: false },
      noiseSuppression: { exact: false },
      autoGainControl: { exact: false }
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
let studioTrackBlob = null;
let studioTrackId = null;
let selectedVoiceBlob = null;
let selectedVoiceId = null;
let studioTextFileName = "";
let selectedTextId = null;
let studioTextBlob = null;
let selectedTextBlob = null;
let activeTapPlayer = null;


// ==========================================
// ESTUDIO
// ==========================================
function cargarAudioEstudio(e) {
  const file = e.target.files[0];
  if (!file) return;

  studioTrackFileName = file.name;
  studioTrackBlob = file;
  studioTrackId = null;

  const url = URL.createObjectURL(file);
  $("player").src || $("text").src === url;
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

// Variables para grabación dúo
let studioStream2 = null;
let duoAudioContext = null;
let duoAnalyser1 = null;
let duoAnalyser2 = null;
let duoAnimationId = null;

async function startStudioRecording() {
  try {
    const player = $("player");
    const micCount = $("micCount");
    const isDuo = micCount && micCount.value === "2";

    studioChunks = [];
    studioRecordedBlob = null;
    $("voicePlayer").src = "";
    $("studioStatus").textContent = "Estado: preparando grabación...";

    // Obtener micrófonos seleccionados
    const mic1Id = getSelectedMicId(1);
    const mic2Id = getSelectedMicId(2);

    const audioConstraints1 = {
      echoCancellation: { exact: false },
      noiseSuppression: { exact: false },
      autoGainControl: { exact: false },
      channelCount: 1,
      sampleRate: 48000
    };

    if (mic1Id) {
      audioConstraints1.deviceId = { exact: mic1Id };
    }

    // Obtener stream del Mic 1
    studioStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints1
    });

    let finalStream = studioStream;

    // Si es DÚO, obtener y mezclar Mic 2
    if (isDuo && mic2Id) {
      const audioConstraints2 = {
        echoCancellation: { exact: false },
        noiseSuppression: { exact: false },
        autoGainControl: { exact: false },
        channelCount: 1,
        sampleRate: 48000,
        deviceId: { exact: mic2Id }
      };

      studioStream2 = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints2
      });

      // Crear contexto de audio para mezclar
      duoAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      const source1 = duoAudioContext.createMediaStreamSource(studioStream);
      const source2 = duoAudioContext.createMediaStreamSource(studioStream2);
      
      // Crear analizadores para visualización
      duoAnalyser1 = duoAudioContext.createAnalyser();
      duoAnalyser2 = duoAudioContext.createAnalyser();
      duoAnalyser1.fftSize = 2048;
      duoAnalyser2.fftSize = 2048;
      
      // Crear mezclador
      const merger = duoAudioContext.createChannelMerger(2);
      const destination = duoAudioContext.createMediaStreamDestination();
      
      // Conectar: fuentes -> analizadores -> mezclador -> destino
      source1.connect(duoAnalyser1);
      source2.connect(duoAnalyser2);
      duoAnalyser1.connect(merger, 0, 0);
      duoAnalyser2.connect(merger, 0, 1);
      merger.connect(destination);
      
      finalStream = destination.stream;

      // Mostrar indicador de dúo
      const duoIndicator = $("duoIndicator");
      if (duoIndicator) {
        duoIndicator.style.display = "block";
      }

      // Iniciar visualización de niveles
      startDuoLevelMonitor();
    }

    const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : {};
    
    studioMediaRecorder = new MediaRecorder(finalStream, options);

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
      
      // Ocultar indicador dúo
      const duoIndicator = $("duoIndicator");
      if (duoIndicator) {
        duoIndicator.style.display = "none";
      }
      
      stopDuoLevelMonitor();
    };

    studioMediaRecorder.start();
    
    // Mostrar estado
    const mic1Select = $("mic1Select");
    const mic1Name = mic1Select ? mic1Select.options[mic1Select.selectedIndex]?.text : "Predeterminado";
    
    if (isDuo && mic2Id) {
      const mic2Select = $("mic2Select");
      const mic2Name = mic2Select ? mic2Select.options[mic2Select.selectedIndex]?.text : "Mic 2";
      $("studioStatus").textContent = `Estado: 🔴 Grabando DÚO (${mic1Name} + ${mic2Name})...`;
    } else {
      $("studioStatus").textContent = `Estado: 🔴 Grabando con ${mic1Name}...`;
    }

    if (player && player.src) {
      player.currentTime = 0;
      player.play();
    }
  } catch (error) {
    console.error(error);
    $("studioStatus").textContent = "Estado: error al acceder al micrófono";
    alert("❌ No se pudo acceder al micrófono. Verifica en Configuración.");
  }
}

function startDuoLevelMonitor() {
  const level1 = $("duoMic1Level");
  const level2 = $("duoMic2Level");

  function updateLevels() {
    if (duoAnalyser1 && level1) {
      const data1 = new Uint8Array(duoAnalyser1.frequencyBinCount);
      duoAnalyser1.getByteFrequencyData(data1);
      const avg1 = data1.reduce((a, b) => a + b, 0) / data1.length;
      level1.style.width = Math.min(100, (avg1 / 128) * 100) + "%";
    }

    if (duoAnalyser2 && level2) {
      const data2 = new Uint8Array(duoAnalyser2.frequencyBinCount);
      duoAnalyser2.getByteFrequencyData(data2);
      const avg2 = data2.reduce((a, b) => a + b, 0) / data2.length;
      level2.style.width = Math.min(100, (avg2 / 128) * 100) + "%";
    }

    if (studioMediaRecorder && studioMediaRecorder.state === "recording") {
      duoAnimationId = requestAnimationFrame(updateLevels);
    }
  }

  updateLevels();
}

function stopDuoLevelMonitor() {
  if (duoAnimationId) {
    cancelAnimationFrame(duoAnimationId);
    duoAnimationId = null;
  }

  // Resetear barras
  const level1 = $("duoMic1Level");
  const level2 = $("duoMic2Level");
  if (level1) level1.style.width = "0%";
  if (level2) level2.style.width = "0%";
}

function stopStudioRecording() {
  if (studioMediaRecorder && studioMediaRecorder.state !== "inactive") {
    studioMediaRecorder.stop();
  }

  // Detener Mic 1
  if (studioStream) {
    studioStream.getTracks().forEach(track => track.stop());
  }

  // Detener Mic 2 (si existe)
  if (studioStream2) {
    studioStream2.getTracks().forEach(track => track.stop());
    studioStream2 = null;
  }

  // Cerrar contexto de audio dúo
  if (duoAudioContext) {
    duoAudioContext.close();
    duoAudioContext = null;
  }

  duoAnalyser1 = null;
  duoAnalyser2 = null;

  stopDuoLevelMonitor();

  // Ocultar indicador
  const duoIndicator = $("duoIndicator");
  if (duoIndicator) {
    duoIndicator.style.display = "none";
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
  // 1. Validación básica
  if (!blob) {
    console.error("❌ No hay audio para guardar");
    return;
  }

  try {
    // 2. Llamamos a tu función de base de datos con los nombres correctos de propiedades
    await saveLibraryItemToSupabase({
      name: options.name || "Archivo",
      type: options.type || "audio",
      blob: blob, // CORRECCIÓN: Cambiado 'audioBlob' por 'blob' para que coincida con la función constructora
      transcription: options.transcription || [],
      metadata: {
        textoPlano: options.textoPlano || null // Guardamos el texto opcional dentro de los metadatos de la fila
      }
    });

    console.log("✅ Guardado en biblioteca correctamente");

    // 3. Actualizamos la interfaz refrescando la carpeta adecuada
    const filtroActual = options.type || 'todos';
    if (typeof renderLibrary === "function") {
      await renderLibrary(filtroActual);
    }

  } catch (error) {
    console.error("Error detallado:", error);
    alert("❌ No se pudo guardar en la nube: " + error.message);
  }
}

/*
async function renderLibrary(filter = 'todos') {
  const container = $("libraryList");
  if (!container) return;

  document.querySelectorAll(".folder-btn").forEach(btn => {
    const clickAttr = btn.getAttribute("onclick") || "";
    if (clickAttr.includes(`'${filter}'`)) {
      btn.classList.add("active"); 
    } else {
      btn.classList.remove("active"); 
    }
  });

  container.innerHTML = "<p>Cargando archivos...</p>";

  try {
    // 1. Mejora de eficiencia: Si no es 'todos', usamos el índice de la DB
    let filteredItems;
    if (filter === 'todos') {
      filteredItems = await getAllLibraryItems();
    } else {
      //getLibraryItemsByType es la función que definimos antes, ¡mucho más rápida!
      filteredItems = await getLibraryItemsByType(filter);
    }
    let library = await getAllLibraryItems();
    let libraryItems = filter !== 'todos' ? library.filter(item => item.type === filter) : library;
    
    container.innerHTML = "";

    if (filteredItems.length === 0) {
      container.innerHTML = `<p>La carpeta '${filter}' está vacía.</p>`;
    } else {
      filteredItems.forEach((item) => {
        const div = document.createElement("div");
        div.className = "library-item card";
        div.style.marginBottom = "10px";
        
        // Convertimos el timestamp (Date.now) a algo bonito para el usuario
        const fechaLegible = typeof item.date === 'number' 
          ? new Date(item.date).toLocaleString() 
          : item.date;

        if (item.type === "texto") {
          const totalPalabras = item.lyrics ? item.lyrics.length : 0;
          div.innerHTML = `
            <p><strong>📄 ${item.name}</strong></p>
            <small>Tipo: LETRA | ${fechaLegible} | ${totalPalabras} palabras</small>
            <div style="display: flex; gap: 10px;">
              <button type="button" data-id="${item.id}" class="load-monitor-btn" style="background:#3b82f6; color:white;">📥 Cargar en Monitor</button>
              <button type="button" data-id="${item.id}" class="delete-library-btn" style="background:#e11d48;">🗑️ Eliminar</button>
            </div>
          `;
        } else {
          // Crear URL temporal para el audio
          const audioURL = item.audioBlob ? URL.createObjectURL(item.audioBlob) : "";
          
          div.innerHTML = `
            <p><strong>🎵 ${item.name}</strong></p>
            <small>Tipo: ${item.type.toUpperCase()} | ${fechaLegible}</small>
            <audio controls src="${audioURL}" style="width:100%; margin: 10px 0;"></audio>
            <button type="button" data-id="${item.id}" class="delete-library-btn" style="...">🗑️ Eliminar</button>
          `;
        }
        container.appendChild(div);
      });
    }

    // 2. Delegación de eventos (Mejorado)
    // En lugar de reactivar botones, usamos una pequeña función de ayuda
    asignarEventosBiblioteca(filter);

    // 3. Actualizar el resto de la app
    actualizarSelectoresGlobales();

  } catch (error) {
    console.error("Error en renderLibrary:", error);
    container.innerHTML = "<p>❌ Error al cargar la biblioteca.</p>";
  }
}

// Función separada para no ensuciar renderLibrary

function asignarEventosBiblioteca(filter) {
  // Evento Borrar
  document.querySelectorAll(".delete-library-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (confirm("¿Estás seguro de eliminar este archivo?")) {
        const id = Number(btn.dataset.id);
        await deleteLibraryItemFromDB(id); // Nombre corregido
        renderLibrary(filter); 
      }
    };
  });

  // Evento Monitor
  document.querySelectorAll(".load-monitor-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const item = library.find(i => i.id === id);

      //if (item && item.textoPlano) {
        const monitor = document.getElementById("lyricsText") || document.getElementById("miniMonitorTextArea");

        if (monitor) {
          monitor.value = id.textoPlano;
        }
        await cargarTextoEnMonitor(Number(btn.dataset.id));
      //} else {
        alert("No se encontró el contenedor");
      });
    });
  });
}
*/

async function renderLibrary(filter = "todos") {
  const container = $("libraryList");
  if (!container) return;

  document.querySelectorAll(".folder-btn").forEach(btn => {
    const clickAttr = btn.getAttribute("onclick") || "";
    if (clickAttr.includes(`'${filter}'`)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  container.innerHTML = "<p>Cargando archivos...</p>";

  try {
    const library = await getAllLibraryItemsFromSupabase();
    const filteredItems = filter === "todos"
      ? library
      : library.filter(item => item.type === filter);

    container.innerHTML = "";

    if (!filteredItems || filteredItems.length === 0) {
      container.innerHTML = `<p>La carpeta '${filter}' está vacía.</p>`;
      actualizarSelectoresGlobales();
      return;
    }

    filteredItems.forEach((item) => {
      const div = document.createElement("div");
      div.className = "library-item card";
      div.style.marginBottom = "10px";

      if (item.type === "ultrastar_txt") {
        const previewTexto = item.textoPlano
          ? item.textoPlano.substring(0, 120) + "..."
          : "Sin contenido";

        div.innerHTML = `
          <p><strong>${item.name}</strong></p>
          <small>Tipo: 📝 TEXTO ULTRASTAR | ${new Date(item.date).toLocaleString()}</small>
          <div style="background: var(--bg-main); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; margin: 10px 0; white-space: pre-wrap; border: 1px solid var(--border); color: var(--text-muted);">
            ${previewTexto.replace(/</g, "&lt;")}
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" data-id="${item.id}" class="load-monitor-btn" style="background:#3b82f6; color:white;">📥 Cargar en Monitor</button>
            <button type="button" data-id="${item.id}" class="delete-library-btn" style="background:#e11d48; color:white;">🗑️ Eliminar</button>
          </div>
        `;
      } else if (item.type === "texto") {
        let preview = "";
        if (item.textoPlano) {
          preview = item.textoPlano.substring(0, 180) + (item.textoPlano.length > 180 ? "…" : "");
        } else if (Array.isArray(item.lyrics) && item.lyrics.length) {
          const palabras = item.lyrics.slice(0, 40).map(w => w.text || "").filter(Boolean);
          preview = palabras.join(" ") + (item.lyrics.length > 40 ? " …" : "");
        } else {
          preview = "Sin contenido de letra.";
        }

        const isSynced =
          item.isSincronizada === true ||
          (Array.isArray(item.lyrics) &&
            item.lyrics.some(w => (w.startTime || 0) > 0 || (w.duration || 0) > 0));

        const totalPalabras = Array.isArray(item.lyrics) ? item.lyrics.length : 0;

        const syncBadge = isSynced
          ? '<span style="background:#22c55e; color:white; padding:3px 8px; border-radius:6px; font-size:0.8em;">🎯 Sincronizada</span>'
          : '<span style="background:#6b7280; color:white; padding:3px 8px; border-radius:6px; font-size:0.8em;">📝 Texto plano</span>';

        div.innerHTML = `
          <p><strong>📄 ${item.name}</strong> ${syncBadge}</p>
          <small>Tipo: LETRA | ${new Date(item.date).toLocaleString()} | ${totalPalabras} palabras</small>
          <div style="background: var(--bg-main); padding: 10px; border-radius: 6px; font-size: 13px; margin: 10px 0; white-space: pre-wrap; border: 1px solid var(--border); color: var(--text-muted); max-height: 110px; overflow:auto;">
            ${preview.replace(/</g, "&lt;")}
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button type="button" data-id="${item.id}" class="load-monitor-btn" style="background:#3b82f6; color:white;">📥 Cargar en Monitor</button>
            <button type="button" data-id="${item.id}" class="delete-library-btn" style="background:#e11d48; color:white;">🗑️ Eliminar</button>
          </div>
        `;
      } else {
        // CORRECCIÓN DE AUDIO: Mapeamos a 'item.file_url' para coincidir con tu función de guardado en Supabase
        const audioURL = item.file_url || item.audioUrl || (item.audioBlob ? URL.createObjectURL(item.audioBlob) : "");
        const isKaraoke = item.type === "karaoke";
        const isReady =
          item.isReadyKaraoke === true ||
          (Array.isArray(item.transcription) && item.transcription.length > 0) ||
          (Array.isArray(item.lyrics) && item.lyrics.some(w => (w.startTime || 0) > 0));

        const karaokeBadge = isKaraoke
          ? (isReady
              ? '<span style="background:#22c55e; color:white; padding:3px 8px; border-radius:6px; font-size:0.8em;">✅ Listo para cantar</span>'
              : '<span style="background:#f59e0b; color:white; padding:3px 8px; border-radius:6px; font-size:0.8em;">⚠️ Sin sincronización</span>')
          : "";

        div.innerHTML = `
          <p><strong>${item.name}</strong> ${karaokeBadge}</p>
          <small>Tipo: ${String(item.type || "").toUpperCase()} | ${new Date(item.date).toLocaleString()}</small>
          ${audioURL
            ? `<audio controls src="${audioURL}" style="width:100%; margin: 10px 0;"></audio>`
            : '<p style="color:red; font-size:12px;">Audio no encontrado</p>'}
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            ${isKaraoke ? `<button type="button" data-id="${item.id}" class="send-karaoke-btn" style="background:#a855f7; color:white;">📤 Enviar al monitor karaoke</button>` : ""}
            <button type="button" data-id="${item.id}" class="delete-library-btn" style="background:#e11d48; color:white;">🗑️ Eliminar</button>
          </div>
        `;
      }

      container.appendChild(div);
    });

    // CORRECCIÓN 1: Evento Eliminar sin forzar Number()
    container.querySelectorAll(".delete-library-btn").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("¿Estás seguro de eliminar este archivo?")) return;
        const id = btn.dataset.id; 
        await deleteLibraryItem(id);
        await renderLibrary(filter);
      };
    });

    // CORRECCIÓN 2: Cargar Monitor sin forzar Number()
    container.querySelectorAll(".load-monitor-btn").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id; 
        const item = library.find(i => String(i.id) === String(id));
        if (!item) return;

        const texto =
          item.textoPlano ||
          (Array.isArray(item.lyrics) ? item.lyrics.map(w => w.text || "").join(" ").trim() : "");

        if (!texto) {
          alert("⚠️ Este archivo no tiene texto para cargar.");
          return;
        }

        const monitor = document.getElementById("lyricsText") || document.getElementById("miniMonitorTextArea");
        if (!monitor) {
          alert("⚠️ No se encontró el contenedor visual del monitor en esta pantalla.");
          return;
        }

        monitor.value = texto;
        alert(`✅ Letra de "${item.name}" cargada en el monitor del Estudio.`);
        monitor.scrollIntoView({ behavior: "smooth", block: "center" });
      };
    });

    // CORRECCIÓN 3: Enviar a Karaoke sin forzar Number()
    container.querySelectorAll(".send-karaoke-btn").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id; 
        const selectedItem = library.find(i => String(i.id) === String(id));

        try {
          if (typeof loadKaraokeSong !== "function") {
            alert("⚠️ Función de carga de karaoke no disponible.");
            return;
          }

          await loadKaraokeSong(id);
          alert(`✅ "${selectedItem?.name || "Karaoke"}" enviado al monitor karaoke.`);
        } catch (e) {
          console.error("Error enviando al monitor karaoke:", e);
          alert("❌ No se pudo enviar al monitor karaoke.");
        }
      };
    });

    actualizarSelectoresGlobales();
  } catch (error) {
    // AQUÍ SE REPARÓ EL CIERRE DE LA FUNCIÓN
    console.error("Error en renderLibrary:", error);
    container.innerHTML = "<p>❌ Error al cargar la biblioteca.</p>";
  }
}

function asignarEventosBiblioteca(filter) {
  document.querySelectorAll(".delete-library-btn").forEach((btn) => {
    btn.onclick = async () => {
      if (confirm("¿Estás seguro de eliminar este archivo?")) {
        const id = btn.dataset.id; 
        await deleteLibraryItem(id, filter); 
      }
    };
  });
}

async function deleteLibraryItem(id, currentFilter = 'todos') {
  try {
    await deleteLibraryItemFromSupabase(id);
    await renderLibrary(currentFilter);
    console.log(`✅ Archivo ${id} eliminado correctamente.`);
  } catch (error) {
    console.error("Error al eliminar:", error);
    alert("❌ No se pudo eliminar el archivo. Inténtalo de nuevo.");
  }
}

// CORRECCIÓN 1: Cambiado 'supabase' por 'db'
async function deleteLibraryItemFromSupabase(id) {
  if (!db) throw new Error("❌ No hay conexión con la base de datos.");
  
  const { error } = await db
    .from('library')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

async function saveManualFileToLibrary() {
  const fileInput = $("libraryFileInput");
  const typeSelect = $("libraryFileType");
  const nameInput = $("libraryFileName");

  const file = fileInput?.files[0];
  const type = typeSelect?.value || "audio";
  const customName = nameInput?.value.trim() || "";

  if (!file) {
    alert(type === "texto" ? "⚠️ Selecciona un .txt" : "⚠️ Selecciona un audio");
    return;
  }

  try {
    const libraryItem = {
      name: customName || file.name,
      type: type,
      date: new Date().toISOString(), 
      metadata: {},
      transcription: []
    };

    if (type === "texto" || type === "ultrastar_txt") {
      const textoPlano = await leerArchivoTexto(file);
      libraryItem.textoPlano = textoPlano;
      libraryItem.lyrics = typeof segmentarTextoPlano === "function" ? segmentarTextoPlano(textoPlano) : [];
      libraryItem.isSincronizada = false;
    } else {
      // CORRECCIÓN 2: Subida automática de audios/karaokes al Storage de Supabase
      libraryItem.isReadyKaraoke = (type === "karaoke");
      
      const mimeType = file.type || "application/octet-stream";
      // Reutilizamos tu función existente para subir el archivo binario
      const { filePath, fileUrl } = await uploadFileToSupabase(file, libraryItem.name, mimeType);
      
      // Guardamos las rutas en el objeto de la base de datos
      libraryItem.file_path = filePath;
      libraryItem.file_url = fileUrl; 
    }

    // CORRECCIÓN 3: Cambiado 'supabase' por 'db'
    const { data, error } = await db
      .from('library')
      .insert([libraryItem]);

    if (error) throw new Error(error.message);

    if (fileInput) fileInput.value = "";
    if (nameInput) nameInput.value = "";

    await renderLibrary("todos");
    alert(`✅ Guardado en la nube ${type.toUpperCase()}`);

  } catch (error) {
    console.error("Error al guardar en Supabase:", error);
    alert("❌ Error al guardar: " + error.message);
  }
}

async function loadTrackOptionsInStudio() {
  const select = $("studioTrackSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecciona una pista desde Biblioteca</option>`;

  try {
    const tracks = await getLibraryItemsByTypeFromSupabase("pista");

    if (!tracks.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No hay pistas guardadas";
      select.appendChild(option);
      return;
    }

    tracks.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id; // Guarda el ID tal cual viene de Supabase (sea número o string)
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
  
  let status = $("studioStatus");
  if (!status && player) {
    status = document.createElement("p");
    status.id = "studioStatus";
    status.style.fontSize = "14px";
    status.style.marginTop = "10px";
    player.parentNode.insertBefore(status, player.nextSibling);
  }

  if (!select || !player || !status) return;

  // CORRECCIÓN 1: Quitamos Number() para que sea totalmente compatible con IDs UUID o texto
  const selectedId = select.value; 

  if (!selectedId) {
    alert("⚠️ Selecciona una pista");
    return;
  }

  try {
    const item = await getLibraryItemByIdFromSupabase(selectedId);

    if (!item) {
      alert("⚠️ No se encontró la pista");
      return;
    }

    studioTrackFileName = item.name;
    studioTrackId = item.id;
    
    // CORRECCIÓN 2: Asignamos el enlace de audio o el archivo a la variable global de tu estudio
    studioTrackBlob = item.file_url || item.audioBlob; 
    
    // Cargamos la URL directa de Supabase Storage en el reproductor HTML5
    player.src = item.file_url;
    
    status.innerHTML = `🎵 <strong>Estado:</strong> pista cargada desde Biblioteca (<span style="color:#22c55e;">${item.name}</span>)`;
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
    const voces = await getLibraryItemsByTypeFromSupabase("voz");
    const grabaciones = await getLibraryItemsByTypeFromSupabase("grabacion");

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
      option.value = item.id; // Guarda el ID original de Supabase (sea número o UUID)
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

  // CORRECCIÓN 1: Quitamos Number() para mantener compatibilidad con UUIDs o texto de Supabase
  const selectedId = select.value;

  if (!selectedId) {
    alert("⚠️ Selecciona un archivo");
    return;
  }

  try {
    const item = await getLibraryItemByIdFromSupabase(selectedId);

    if (!item) {
      alert("⚠️ No se encontró el archivo");
      return;
    }

    // --- BIFURCACIÓN: SI EL ARCHIVO ES TEXTO PLANO MANUAL ---
    if (item.type === "texto") {
      selectedVoiceBlob = null; 
      selectedVoiceId = item.id;

      player.src = "";
      status.textContent = `Estado: Letra manual seleccionada -> ${item.name}`;

      if (Array.isArray(item.lyrics) && item.lyrics.length > 0) {
        transcriptionSegments = item.lyrics.map(word => ({
          id: word.id,
          text: word.text,
          startTime: word.startTime,
          duration: word.duration,
          pitch: word.pitch
        }));

        renderKaraokeLyrics(transcriptionSegments);
        cargarLetrasEnMonitor();

        if (lyricsText) {
          lyricsText.value = transcriptionSegments
            .map(seg => seg.text || "")
            .join(" ") 
            .trim();
        }

        status.textContent = "Estado: Letra manual cargada en el Monitor ⚡ (Lista para taps)";
      } else {
        transcriptionSegments = [];
        renderKaraokeLyrics([]);
        cargarLetrasEnMonitor();
        if (lyricsText) lyricsText.value = "";
        status.textContent = "Estado: El archivo de texto está vacío";
      }
      
      return; 
    }

    // --- FLUJO ORIGINAL (Para archivos con Audio y Transcripción de IA) ---
    // CORRECCIÓN 2: Asignamos directamente la URL de Supabase Storage en lugar de forzar un fetch de Blob pesado
    selectedVoiceBlob = item.file_url || item.audioBlob;
    selectedVoiceId = item.id;

    player.src = item.file_url;
    status.textContent = `Estado: voz seleccionada -> ${item.name}`;

    if (Array.isArray(item.transcription) && item.transcription.length > 0) {
      baseTranscriptionSegments = item.transcription.map(seg =>
        buildWordTimingFromSegment(seg)
      );

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
    alert("❌ No se pudo cargar el archivo seleccionado");
  }
}

async function loadTextOptionsInStudio() {
  const select = $("textLibrarySelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecciona una letra guardada</option>`;

  try {
    // CORRECCIÓN 1: Enlazado a la función correcta de Supabase
    const letras = await getLibraryItemsByTypeFromSupabase("texto"); 

    const merged = [...letras];

    if (!merged.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No hay letras guardadas";
      select.appendChild(option);
      return;
    }

    merged.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id; // Almacena el ID original (sea número o UUID)
      option.textContent = `${item.name} (${item.date || "sin fecha"})`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadSelectedTextFromLibrary() {
  const select = $("textLibrarySelect");
  const status = $("selectedTextStatus");
  const textInput = $("lyricsText"); 

  if (!select || !status || !textInput) return;

  // CORRECCIÓN 2: Eliminado el Number() para dar soporte a cualquier tipo de ID de Supabase
  const selectedId = select.value;
  if (!selectedId) {
    alert("⚠️ Selecciona una letra de la lista primero.");
    return;
  }

  try {
    // CORRECCIÓN 3: Enlazado a la función correcta de lectura por ID de Supabase
    const item = await getLibraryItemByIdFromSupabase(selectedId);
    if (!item) {
      alert("⚠️ No se encontró la letra en la base de datos.");
      return;
    }

    selectedTextId = item.id;
    selectedVoiceId = item.id; 

    if (Array.isArray(item.lyrics) && item.lyrics.length > 0) {
      textSegments = item.lyrics;

      try { renderKaraokeLyrics(textSegments); } catch(e) {}
      try { cargarLetrasEnMonitor(); } catch(e) {}

      // 🎯 RECONSTRUCCIÓN DE LÍNEAS ORIGINALES PARA EL MONITOR
      let textoFormateadoParaPantalla = "";
      
      textSegments.forEach((word, index) => {
        textoFormateadoParaPantalla += word.text;
        
        const nextWord = textSegments[index + 1];
        if (nextWord) {
          if (nextWord.renglon !== word.renglon) {
            textoFormateadoParaPantalla += "\n";
          } else {
            textoFormateadoParaPantalla += " ";
          }
        }
      });

      textInput.value = textoFormateadoParaPantalla;
      status.innerHTML = `📄 <strong>Estado:</strong> Letra cargada respetando tus líneas de estrofa original ⚡`;
    } else {
      textSegments = [];
      textInput.value = "";
      status.textContent = "Estado: El archivo de texto no contiene palabras válidas.";
    }
  } catch (error) {
    console.error(error);
    alert("❌ No se pudo cargar la letra seleccionada.");
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
    transcriptionSegments = splitSegmentsIntoKaraokeLines(baseTranscriptionSegments, 7);

    renderKaraokeLyrics(transcriptionSegments);
    cargarLetrasEnMonitor();

    if (lyricsText) {
      lyricsText.value = transcriptionSegments.map(line => line.text).join("\n");
    }

    // --- CORRECCIÓN: GUARDADO AUTOMÁTICO EN SUPABASE ---
    if (selectedVoiceId) {
      try {
        // Cambiado a la función oficial adaptada para Supabase
        await updateLibraryItemFromSupabase(selectedVoiceId, {
          transcription: baseTranscriptionSegments // Guardamos los tiempos y textos en la columna JSON
        });
        console.log("✅ Transcripción guardada con éxito en Supabase");
      } catch (err) {
        console.error("❌ Error guardando transcripción en la nube:", err);
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
        end: segment.end,
        pitch: segment.pitch || null,
        note: segment.note || null
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
      end: wordEnd,
      pitch: segment.pitch || null,
      note: segment.note || null
    };
  });

  return {
    ...segment,
    words: timedWords
  };
}

// ==========================================
// ANÁLISIS DE PITCH PARA ULTRASTAR
// ==========================================
// 🎯 VERSIÓN CORREGIDA: Ahora acepta los tres parámetros de tu flujo unificado
async function analyzePitchForSegments(audioBlob, textBlob, segments) {
  
  let actualSegments = segments;
  if (Array.isArray(textBlob) && !segments) {
    actualSegments = textBlob; 
  }

  if (!audioBlob || !actualSegments || !actualSegments.length) {
    console.log("⚠️ No hay audio o segmentos para analizar");
    return actualSegments;
  }

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // CORRECCIÓN: Si 'audioBlob' es una URL de Supabase (un string), la descargamos temporalmente en la RAM
    let targetBlob = audioBlob;
    if (typeof audioBlob === "string") {
      const response = await fetch(audioBlob);
      targetBlob = await response.blob();
    }

    // Procesamos el buffer utilizando el binario real garantizado
    const arrayBuffer = await targetBlob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    
    console.log("🎵 Analizando pitch de", actualSegments.length, "segmentos...");

    const analyzedSegments = actualSegments.map((segment, index) => {
      const startTime = segment.start !== undefined ? segment.start : (segment.startTime || 0);
      const durationTime = segment.duration !== undefined ? segment.duration : 0.5;
      const endTime = segment.end !== undefined ? segment.end : (startTime + durationTime);

      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.floor(endTime * sampleRate);
      
      const segmentSamples = channelData.slice(startSample, endSample);
      
      const pitch = detectPitchFromSamples(segmentSamples, sampleRate);
      const note = pitch > 0 ? getNoteFromFrequency(pitch) : null;
      const midiNote = pitch > 0 ? frequencyToMidi(pitch) : null;
      
      let analyzedWords = [];
      
      const palabrasInternas = Array.isArray(segment.words) ? segment.words : [];
      
      if (palabrasInternas.length > 0) {
        analyzedWords = palabrasInternas.map(word => {
          const wStart = word.start !== undefined ? word.start : (word.startTime || startTime);
          const wEnd = word.end !== undefined ? word.end : (wStart + (word.duration || 0.5));

          const wordStartSample = Math.floor(wStart * sampleRate);
          const wordEndSample = Math.floor(wEnd * sampleRate);
          const wordSamples = channelData.slice(wordStartSample, wordEndSample);
          
          const wordPitch = detectPitchFromSamples(wordSamples, sampleRate);
          const wordNote = wordPitch > 0 ? getNoteFromFrequency(wordPitch) : note;
          const wordMidi = wordPitch > 0 ? frequencyToMidi(wordPitch) : midiNote;
          
          return {
            ...word,
            pitch: wordPitch > 0 ? wordPitch : pitch,
            note: wordNote,
            midi: wordMidi
          };
        });
      }

      return {
        ...segment,
        pitch: pitch,
        note: note,
        midi: midiNote || segment.pitch || 60, 
        words: analyzedWords.length > 0 ? analyzedWords : [{ start: startTime, end: endTime, word: segment.text, midi: midiNote || 60 }]
      };
    });

    console.log("✅ Análisis de pitch completado con éxito");
    return analyzedSegments;

  } catch (error) {
    console.error("❌ Error analizando pitch:", error);
    return actualSegments;
  }
}

function detectPitchFromSamples(samples, sampleRate) {
  if (!samples || samples.length < 2048) return -1;
  
  // Calcular RMS para verificar si hay señal
  let rms = 0;
  for (let i = 0; i < samples.length; i++) {
    rms += samples[i] * samples[i];
  }
  rms = Math.sqrt(rms / samples.length);
  
  if (rms < 0.01) return -1; // Silencio
  
  // Autocorrelación simplificada
  const bufferSize = Math.min(2048, samples.length);
  const buffer = samples.slice(0, bufferSize);
  
  let bestOffset = -1;
  let bestCorrelation = 0;
  
  for (let offset = 8; offset < bufferSize / 2; offset++) {
    let correlation = 0;
    
    for (let i = 0; i < bufferSize - offset; i++) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    
    correlation = 1 - (correlation / (bufferSize - offset));
    
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }
  
  if (bestCorrelation < 0.8 || bestOffset === -1) return -1;
  
  const frequency = sampleRate / bestOffset;
  
  // Filtrar frecuencias fuera del rango vocal
  if (frequency < 80 || frequency > 1000) return -1;
  
  return frequency;
}

function frequencyToMidi(freq) {
  if (freq <= 0) return 0;
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Nueva función automatizar
// Ejemplo de procesamiento en tu script.js al recibir los datos del backend
function procesarResultadoAutomatico(apiResponseWords) {
  // apiResponseWords contiene el array de objetos [{word: "hola", start: 0.5, end: 0.9}]
  
  const palabrasSincronizadas = apiResponseWords.map((w) => {
    const inicio = w.start;
    const fin = w.end;

    // --- LA CONEXIÓN CON TUS NOTAS ---
    // Invocas tu analizador de pitch nativo de la app para el intervalo de tiempo exacto
    // de esa palabra en la pista de "voz".
    const frecuenciaDetectada = analizarFrecuenciaAudioVoz(inicio, fin); 
    
    let notaMidi = 60; // Nota base por defecto (Do central) en caso de silencios
    if (frecuenciaDetectada > 0) {
      // Fórmula matemática estándar que ya usas para convertir Hertz a notas MIDI
      notaMidi = Math.round(12 * Math.log2(frecuenciaDetectada / 440) + 69);
    }

    return {
      word: w.word,
      start: inicio,
      end: fin,
      midi: notaMidi // Asignamos de forma automática la altura del pentagrama
    };
  });

  // Almacenas la estructura en la variable global que lee tu Canvas (ej. textSegments)
  textSegments = [{
    start: palabrasSincronizadas[0]?.start || 0,
    end: palabrasSincronizadas[palabrasSincronizadas.length - 1]?.end || 0,
    words: palabrasSincronizadas
  }];

  // Guardas en la base de datos de tu app de karaoke (initDB)
  guardarSincronizacionAutomaticaEnSupabase(textSegments);
}

// Otra función
async function procesarSincronizacionAutomaticaYPitch() {
  // === CONFIGURACIÓN DE SEGURIDAD (MODO DESARROLLADOR) ===
  // Cambia esto a 'false' SOLO cuando vayas a lanzar la app a producción y quieras usar la IA real.
  // Mientras esté en 'true', procesará CUALQUIER canción al instante y GRATIS sin tocar OpenAI.
  const MODO_DESARROLLADOR_GRATIS = false; 

  if (!selectedVoiceBlob) {
    alert("⚠️ Primero selecciona y carga una voz en la sección 'Voz desde Biblioteca'");
    return;
  }

  const textInput = $("lyricsText");
  const letraPegada = textInput ? textInput.value.trim() : "";
  if (!letraPegada) {
    alert("⚠️ Pega la letra de la canción en el cuadro inferior antes de continuar");
    return;
  }

  const status = $("selectedVoiceStatus");
  if (status) status.textContent = "Estado: Preparando audio y analizando componentes... 🚀";

  try {
    let todasLasPalabrasIA = [];
    
    // ===================================================
    // RAMIFICACIÓN PARA AHORRO DE SALDO (MOCK REALISTA INTEGRADO)
    // ===================================================
    
   /* if (MODO_DESARROLLADOR_GRATIS) {
      if (status) status.textContent = "🤖 Modo Desarrollador: Distribuyendo palabras de forma musical... ⚡";
      
      // 1. Separamos el texto pegado en palabras individuales
      const palabras = letraPegada.split(/\s+/).filter(Boolean);
      
      let tiempoActual = 4.0; // Dejamos 4 segundos de intro musical antes de la primera palabra
      
      // 2. Mapeamos las palabras con espaciados humanos de karaoke
      todasLasPalabrasIA = palabras.map((palabra, index) => {
        // Cada 6 palabras simulamos que termina un renglón/estrofa
        const esFinDeLinea = (index + 1) % 6 === 0;
        
        // Las palabras normales duran medio segundo; la última de la frase se sostiene más tiempo (1.1s)
        const duracionPalabra = esFinDeLinea ? 1.1 : 0.5;
        
        const start = tiempoActual;
        const end = tiempoActual + duracionPalabra;
        
        // Si termina la línea, dejamos 2.5 segundos de pausa para respirar. Si no, un microespacio fluido de 0.15s
        const pausaEntrePalabras = esFinDeLinea ? 2.5 : 0.15;
        tiempoActual = end + pausaEntrePalabras;
        
        return { 
          word: palabra, 
          start: Number(start.toFixed(2)), 
          end: Number(end.toFixed(2)) 
        };
      });
      
    } else {
    */
      // FLUJO REAL CON CONSUMO DE SALDO (Se queda exactamente como lo tenías)
    let idiomaDetectado = "es";
    const palabrasIngles = ["the", "and", "you", "that", "was", "for", "with", "this", "have"];
    const palabrasLetra = letraPegada.toLowerCase().split(/\s+/);
    if (palabrasLetra.some(palabra => palabrasIngles.includes(palabra))) {
      idiomaDetectado = "en";
    }
    
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await selectedVoiceBlob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const CHUNK_SECONDS = 25;
    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = audioBuffer.length;
    const samplesPerChunk = CHUNK_SECONDS * sampleRate;

    for (let start = 0; start < totalSamples; start += samplesPerChunk) {
      const end = Math.min(start + samplesPerChunk, totalSamples);
      const chunkNumber = Math.floor(start / samplesPerChunk) + 1;
      const totalChunks = Math.ceil(totalSamples / samplesPerChunk);
      const timeOffset = start / sampleRate;
      
      if (status) {
        status.textContent = `Estado: Procesando tramo ${chunkNumber} de ${totalChunks} con OpenAI... ⏳`;
      }
      
      const wavBlob = audioBufferToWav(audioBuffer, start, end);
      const base64Audio = await blobToBase64(wavBlob);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          audioBase64: base64Audio,
          letraText: letraPegada,
          language: idiomaDetectado
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fallo en el fragmento ${chunkNumber}: ${errorText}`);
      }

      const result = await response.json();
      const listadoPalabrasChunk = Array.isArray(result.words) ? result.words : [];

      listadoPalabrasChunk.forEach((w) => {
        todasLasPalabrasIA.push({
          word: w.word,
          start: Number(w.start) + timeOffset,
          end: Number(w.end) + timeOffset
        });
      });
    }
    
    if (!todasLasPalabrasIA.length) {
      throw new Error("No se obtuvieron marcas de tiempo.");
    }

    if (status) status.textContent = "Estado: Tiempos alineados. Extrayendo notas del pentagrama... 🎵";

    // 4. CONSTRUCCIÓN DE LA ESTRUCTURA COMPATIBLE CON TU CANVAS
    const idCancionActiva = selectedVoiceId || selectedTextId;
    
    // CORRECCIÓN: Acceso seguro al primer elemento [0] para evitar errores de compilación
    const primerStart = todasLasPalabrasIA[0] ? todasLasPalabrasIA[0].start : 0;
    const ultimoEnd = todasLasPalabrasIA[todasLasPalabrasIA.length - 1] ? todasLasPalabrasIA[todasLasPalabrasIA.length - 1].end : 120;

    const segmentosBaseIA = [{
      start: primerStart,
      end: ultimoEnd,
      text: letraPegada,
      words: todasLasPalabrasIA
    }];

    // Tu extractor matemático nativo analizará el audio real calculando los Hz
    const segmentosConPitchYNotas = await analyzePitchForSegments(selectedVoiceBlob, segmentosBaseIA);

    // Dividimos en renglones limpios para el karaoke en grupos de 7 palabras
    transcriptionSegments = splitSegmentsIntoKaraokeLines(segmentosConPitchYNotas, 7);

    // 5. GUARDADO COMPATIBLE E INYECCIÓN DE LA PISTA DE MÚSICA INSTRUMENTAL
     if (idCancionActiva) {
      // CORRECCIÓN 1: Usamos la función de lectura correcta de Supabase
      const itemOriginal = await getLibraryItemByIdFromSupabase(idCancionActiva);
      
      if (itemOriginal) {
        // Creamos el objeto con los campos exactos que cambian en la base de datos
        let datosFinalesKaraoke = {
          isSincronizada: true,
          isReadyKaraoke: true,
          type: "karaoke", 
          transcription: transcriptionSegments // Guardamos las líneas sincronizadas en la columna JSON
        };

        // Si hay una pista cargada, le cambiamos el nombre para identificar el Karaoke
        if (typeof studioTrackFileName !== "undefined" && studioTrackFileName) {
          datosFinalesKaraoke.name = "Karaoke - " + studioTrackFileName;
        }

        // CORRECCIÓN 2: En lugar de machacar todo el registro, actualizamos solo los cambios en la nube
        await updateLibraryItemFromSupabase(idCancionActiva, datosFinalesKaraoke);
        console.log("✅ Registro convertido a Karaoke e indexado en Supabase.");
      }
    }

    // 6. ACTUALIZACIÓN INMEDIATA DE LA INTERFAZ
    renderKaraokeLyrics(transcriptionSegments);
    if (typeof renderLibrary === "function") {
      // Refrescamos de manera consecutiva y segura las carpetas de la interfaz
      await renderLibrary('todos');
      await renderLibrary('karaoke');
    }
    if (typeof loadTrackOptionsInStudio === "function") await loadTrackOptionsInStudio();
    if (typeof cargarLetrasEnMonitor === "function") cargarLetrasEnMonitor();

    if (status) status.textContent = "Estado: ¡Karaoke creado con éxito! Listo en tu biblioteca ✅";
    alert("🎯 Sincronización concluida");

  } catch (error) {
    console.error("Error global en el flujo:", error);
    alert(`❌ Detalle del error: ${error.message}`);
    if (status) status.textContent = "Estado: Error en procesamiento";
  }
}

function splitSegmentsIntoKaraokeLines(segments, maxWordsPerLine = 7) {
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

  if (!lines.length) return [];

  // 🎯 PARCHE DE COMPATIBILIDAD MANUAL:
  // Si no hay segmentos base de la IA, simulamos un flujo lineal con tiempos estimados en 0
  const tieneBaseValida = Array.isArray(baseSegments) && baseSegments.length > 0;
  
  const totalStart = tieneBaseValida ? (baseSegments[0].start || baseSegments[0].startTime || 0) : 0;
  const totalEnd = tieneBaseValida ? (baseSegments[baseSegments.length - 1].end || baseSegments[baseSegments.length - 1].endTime || 120) : (lines.length * 3.0);
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
      startTime: cursor, // Duplicamos propiedades para satisfacer ambas estructuras
      duration: duration,
      text: line
    };

    cursor += duration;
    
    // Ejecutamos tu reconstructor nativo de palabras por segmento
    try {
      return buildWordTimingFromSegment(segment);
    } catch(e) {
      // Si la función buildWordTimingFromSegment no está disponible en este scope, devolvemos el objeto limpio
      return {
        ...segment,
        words: line.split(' ').map((w, wi) => ({ start: segment.start, end: segment.end, word: w }))
      };
    }
  });
}

function renderKaraokeLyrics(segments) {
  const container = $("karaokeLyrics");
  if (!container) return;

  console.log("renderKaraokeLyrics -> segmentos cargados:", segments);

  container.innerHTML = "";

  if (!Array.isArray(segments) || !segments.length) {
    container.innerHTML = `<p class="karaoke-placeholder">No hay segmentos para mostrar.</p>`;
    return;
  }

  segments.forEach((segment, index) => {
    const line = document.createElement("p");
    line.className = "karaoke-line";
    line.dataset.index = index;

    // NORMALIZACIÓN DE TIEMPOS DE FRASE
    const segStart = segment.start !== undefined ? segment.start : (segment.startTime || 0);
    const segEnd = segment.end !== undefined ? segment.end : (segStart + (segment.duration || 1));

    line.dataset.start = Number(segStart);
    line.dataset.end = Number(segEnd);

    // Extraemos las palabras internas si existen, o generamos una simulación limpia
    const words = Array.isArray(segment.words) ? segment.words : [];

    if (words.length) {
      words.forEach((wordObj, wordIndex) => {
        const span = document.createElement("span");
        span.className = "karaoke-word";

        // NORMALIZACIÓN DE PROPIEDADES DE PALABRAS
        const wStart = wordObj.start !== undefined ? wordObj.start : (wordObj.startTime || segStart);
        const wEnd = wordObj.end !== undefined ? wordObj.end : (wStart + (wordObj.duration || 0.5));
        const wText = wordObj.word !== undefined ? wordObj.word : (wordObj.text || "");

        span.dataset.start = Number(wStart);
        span.dataset.end = Number(wEnd);
        span.textContent = wText + (wordIndex < words.length - 1 ? " " : "");
        line.appendChild(span);
      });
    } else {
      // Si es una línea plana sin sub-palabras, la tratamos como un elemento único
      const span = document.createElement("span");
      span.className = "karaoke-word";
      span.dataset.start = Number(segStart);
      span.dataset.end = Number(segEnd);
      span.textContent = (segment.text || "").trim();
      line.appendChild(span);
    }

    container.appendChild(line);
  });
}

function updateKaraokeHighlight(currentTime) {
  const lines = document.querySelectorAll(".karaoke-line");
  if (!lines.length) return;

  let activeLine = null;

  lines.forEach((line) => {
    // Validamos que el parseo no devuelva NaN asignando un 0 de respaldo
    const start = parseFloat(line.dataset.start) || 0;
    const end = parseFloat(line.dataset.end) || 0;

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
      const wordStart = parseFloat(word.dataset.start) || 0;
      const wordEnd = parseFloat(word.dataset.end) || 0;

      word.classList.remove("active-word", "past-word");

      if (currentTime >= wordStart && currentTime <= wordEnd) {
        word.classList.add("active-word");
      } else if (currentTime > wordEnd) {
        word.classList.add("past-word");
      }
    });
  });

  // Asegura el auto-scroll fluido centrado si la variable global existe
  const isScrollEnabled = typeof autoScrollEnabled !== "undefined" ? autoScrollEnabled : true;
  if (activeLine && isScrollEnabled) {
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
let karaokeStream2 = null;
let karaokeChunks = [];
let karaokeRecordedBlob = null;
let karaokeSelectedTrackBlob = null;
let karaokeSelectedTrackName = "Karaoke";
let lastActiveLine = null;
let karaokeDuoAudioContext = null;
let karaokeDuoAnalyser1 = null;
let karaokeDuoAnalyser2 = null;
let karaokeDuoAnimationId = null;
let karaokeDuoMonitorActive = false;
let karaokeLoadedItem = null;
let karaokeLoadedLyrics = [];
//let karaokeReadyToSing = false;
let karaokeTrackObjectUrl = "";


async function loadKaraokeSong(id) {
  try {
    // CORRECCIÓN 1: Enlazamos con la función de consulta oficial de Supabase
    const item = await getLibraryItemByIdFromSupabase(id);
    if (!item) {
      alert("⚠️ No se encontró el karaoke.");
      return;
    }

    // CORRECCIÓN 2: Validamos usando la URL del Storage en lugar de un Blob local
    if (!item.file_url) {
      alert("⚠️ Este karaoke no tiene audio en la nube.");
      return;
    }

    // Guardamos las referencias en tus variables globales actuales de la aplicación
    karaokeLoadedItem = item;
    karaokeSelectedTrackBlob = item.file_url; // Pasamos la URL directa para que el reproductor sepa de dónde leer
    karaokeSelectedTrackName = item.name || "Karaoke";

    // Como ya no usamos Blobs locales en memoria, limpiamos el revocador antiguo
    if (karaokeTrackObjectUrl) {
      try { URL.revokeObjectURL(karaokeTrackObjectUrl); } catch (e) {}
      karaokeTrackObjectUrl = null;
    }

    const track = $("karaokeTrack") || $("karaokeAudio") || $("audioKaraoke") || $("trackPlayer");
    if (track) {
      try { track.pause(); } catch (e) {}
      track.currentTime = 0;
      
      // CORRECCIÓN 3: Cargamos el enlace directo de Supabase Storage en el reproductor musical
      track.src = item.file_url; 
      track.volume = 0.6;
      track.load();
    }

    // Cargamos los renglones sincronizados de las letras desde la columna JSON
    if (Array.isArray(item.transcription) && item.transcription.length) {
      transcriptionSegments = item.transcription;
      karaokeLoadedLyrics = item.transcription;
    } else if (Array.isArray(item.lyrics) && item.lyrics.length) {
      transcriptionSegments = item.lyrics;
      karaokeLoadedLyrics = item.lyrics;
    } else {
      transcriptionSegments = [];
      karaokeLoadedLyrics = [];
    }

    cargarLetrasEnMonitor();

    const status = $("karaokeStatus");
    if (status) {
      status.textContent = `Estado: "${item.name}" cargada. ¡A cantar! 🎤`;
    }
  } catch (error) {
    console.error("Error cargando karaoke:", error);
    alert("❌ Error al cargar el karaoke.");
  }
}

/*
function cargarPistaKaraoke(e) {
  const file = e.target.files[0];
  if (!file) return;

  karaokeLoadedItem = null;
  karaokeSelectedTrackBlob = file;
  karaokeSelectedTrackName = file.name;
  karaokeLoadedLyrics = [];

  const track = $("karaokeTrack");
  track.src = URL.createObjectURL(file);
  track.volume = 0.5;

  $("karaokeStatus").textContent = "Estado: Pista lista. ¡Presiona Iniciar Grabación!";
  cargarLetrasEnMonitor();
}
*/

async function loadTrackOptionsInKaraoke() {
  const select = $("karaokeTrackSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Selecciona un karaoke desde tu Biblioteca</option>`;

  try {
    const karaokeItems = await getLibraryItemsByTypeFromSupabase("karaoke");

    if (!karaokeItems.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No hay karaokes guardados";
      select.appendChild(option);
      return;
    }

    karaokeItems.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id; // Guarda el ID original (número o UUID) de forma transparente
      option.textContent = item.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error(error);
  }
}

async function loadSelectedTrackFromLibraryKaraoke() {
  const select = $("karaokeTrackSelect");
  
  // CORRECCIÓN: Quitamos el Number() para que acepte tanto números enteros como textos (UUIDs)
  const id = select?.value;

  if (!id) {
    alert("⚠️ Selecciona un karaoke de la lista.");
    return;
  }

  // Ejecuta la carga nativa en streaming que reescribimos anteriormente
  await loadKaraokeSong(id);
}

function cargarLetrasEnMonitor() {
  const container = $("karaokeLiveLyrics");
  if (!container) return;

  container.innerHTML = "";

  const segments = Array.isArray(karaokeLoadedLyrics) && karaokeLoadedLyrics.length
    ? karaokeLoadedLyrics
    : (Array.isArray(transcriptionSegments) ? transcriptionSegments : []);

  if (!Array.isArray(segments) || segments.length === 0) {
    container.innerHTML = `<p class="karaoke-placeholder" style="font-size:18px;">⚠️ Este karaoke no tiene letras sincronizadas cargadas.</p>`;
    return;
  }

  segments.forEach((seg) => {
    const p = document.createElement("p");
    p.className = "karaoke-live-line";
    p.dataset.start = Number(seg.start || seg.startTime || 0);
    p.dataset.end = Number(seg.end || ((seg.startTime || 0) + (seg.duration || 0)));

    const words = Array.isArray(seg.words) ? seg.words : [];

    if (words.length) {
      words.forEach((wordObj, index) => {
        const span = document.createElement("span");
        span.className = "karaoke-live-word";
        span.dataset.start = Number(wordObj.start || wordObj.startTime || 0);
        span.dataset.end = Number(wordObj.end || ((wordObj.startTime || 0) + (wordObj.duration || 0)));
        span.textContent = (wordObj.word || wordObj.text || "") + (index < words.length - 1 ? " " : "");
        p.appendChild(span);
      });
    } else {
      p.textContent = (seg.text || "").trim();
    }

    container.appendChild(p);
  });
}

function getRmsLevel(analyser, multiplier = 280) {
  if (!analyser) return 0;

  const bufferLength = analyser.fftSize;
  const data = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(data);

  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    const sample = (data[i] - 128) / 128;
    sum += sample * sample;
  }

  const rms = Math.sqrt(sum / bufferLength);

  return Math.min(100, Math.max(0, rms * multiplier));
}

async function startKaraokeRecording() {
  const track = $("karaokeTrack") || $("karaokeAudio") || $("audioKaraoke") || $("trackPlayer");

  // Validamos usando 'karaokeSelectedTrackBlob' que ahora guarda la URL de Supabase de manera segura
  if (!karaokeSelectedTrackBlob || !karaokeLoadedItem) {
    alert("⚠️ Primero selecciona un karaoke de la lista.");
    return;
  }

  if (!track) {
    alert("⚠️ No se encontró el reproductor de karaoke.");
    return;
  }

  // CORRECCIÓN: Si el reproductor no tiene origen, le asignamos la URL directa de la nube
  if (!track.src && karaokeSelectedTrackBlob) {
    track.src = karaokeSelectedTrackBlob; // Copia el enlace 'file_url' de Supabase
    track.volume = 0.3;
    track.load();
  }

  if (!track.src) {
    alert("⚠️ No se pudo preparar el audio del karaoke.");
    return;
  }

  try {
    const micCount = $("micCount");
    const isDuo = micCount && micCount.value === "2";

    karaokeChunks = [];
    karaokeRecordedBlob = null;
    $("karaokeVoicePlayer").src = "";

    const mic1Id = getSelectedMicId(1);
    const mic2Id = getSelectedMicId(2);

    const audioConstraints1 = {
      echoCancellation: { exact: false },
      noiseSuppression: { exact: false },
      autoGainControl: { exact: false },
      channelCount: 1,
      sampleRate: 48000
    };

    if (mic1Id) {
      audioConstraints1.deviceId = { exact: mic1Id };
    }

    karaokeStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints1
    });

    let finalStream = karaokeStream;

    if (isDuo && mic2Id) {
      const audioConstraints2 = {
        echoCancellation: { exact: false },
        noiseSuppression: { exact: false },
        autoGainControl: { exact: false },
        channelCount: 1,
        sampleRate: 48000,
        deviceId: { exact: mic2Id }
      };

      karaokeStream2 = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints2
      });

      karaokeDuoAudioContext = new (window.AudioContext || window.webkitAudioContext)();

      const source1 = karaokeDuoAudioContext.createMediaStreamSource(karaokeStream);
      const source2 = karaokeDuoAudioContext.createMediaStreamSource(karaokeStream2);

      karaokeDuoAnalyser1 = karaokeDuoAudioContext.createAnalyser();
      karaokeDuoAnalyser2 = karaokeDuoAudioContext.createAnalyser();
      karaokeDuoAnalyser1.fftSize = 2048;
      karaokeDuoAnalyser2.fftSize = 2048;
      karaokeDuoAnalyser1.smoothingTimeConstant = 0.8;
      karaokeDuoAnalyser2.smoothingTimeConstant = 0.8;

      const merger = karaokeDuoAudioContext.createChannelMerger(2);
      const destination = karaokeDuoAudioContext.createMediaStreamDestination();

      source1.connect(karaokeDuoAnalyser1);
      source2.connect(karaokeDuoAnalyser2);
      karaokeDuoAnalyser1.connect(merger, 0, 0);
      karaokeDuoAnalyser2.connect(merger, 0, 1);
      merger.connect(destination);

      finalStream = destination.stream;

      const duoIndicator = $("karaokeDuoIndicator");
      if (duoIndicator) duoIndicator.style.display = "block";

      startKaraokeDuoLevelMonitor();
    }

    const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : {};

    karaokeMediaRecorder = new MediaRecorder(finalStream, options);

    karaokeMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) karaokeChunks.push(e.data);
    };

    karaokeMediaRecorder.onstop = () => {
      karaokeRecordedBlob = new Blob(karaokeChunks, { type: "audio/webm" });
      $("karaokeVoicePlayer").src = URL.createObjectURL(karaokeRecordedBlob);
      $("karaokeStatus").textContent = "Estado: Grabación finalizada ✅";

      const duoIndicator = $("karaokeDuoIndicator");
      if (duoIndicator) duoIndicator.style.display = "none";

      stopKaraokeDuoLevelMonitor();
    };

    karaokeMediaRecorder.start();

    track.pause();
    track.currentTime = 0;
    await track.play();

    startKaraokePitchDetection();

    const mic1Select = $("mic1Select");
    const mic1Name = mic1Select ? mic1Select.options[mic1Select.selectedIndex]?.text : "Mic 1";

    if (isDuo && mic2Id) {
      const mic2Select = $("mic2Select");
      const mic2Name = mic2Select ? mic2Select.options[mic2Select.selectedIndex]?.text : "Mic 2";
      $("karaokeStatus").textContent = `Estado: 🔴 Grabando DÚO (${mic1Name} + ${mic2Name}) con "${karaokeSelectedTrackName}"...`;
    } else {
      $("karaokeStatus").textContent = `Estado: 🔴 Grabando con ${mic1Name} sobre "${karaokeSelectedTrackName}"...`;
    }

    $("karaokeStartBtn").disabled = true;
  } catch (err) {
    console.error(err);
    alert("❌ Error al acceder al micrófono. Verifica en Configuración.");
  }
}

function startKaraokeDuoLevelMonitor() {
  const level1 = $("karaokeDuoMic1Level");
  const level2 = $("karaokeDuoMic2Level");

  stopKaraokeDuoLevelMonitor();
  karaokeDuoMonitorActive = true;

  function updateLevels() {
    if (!karaokeDuoMonitorActive) return;

    if (karaokeDuoAnalyser1 && level1) {
      const data1 = new Uint8Array(karaokeDuoAnalyser1.frequencyBinCount);
      karaokeDuoAnalyser1.getByteFrequencyData(data1);
      const avg1 = data1.reduce((a, b) => a + b, 0) / data1.length;
      level1.style.width = Math.min(100, (avg1 / 128) * 100) + "%";
    }

    if (karaokeDuoAnalyser2 && level2) {
      const data2 = new Uint8Array(karaokeDuoAnalyser2.frequencyBinCount);
      karaokeDuoAnalyser2.getByteFrequencyData(data2);
      const avg2 = data2.reduce((a, b) => a + b, 0) / data2.length;
      level2.style.width = Math.min(100, (avg2 / 128) * 100) + "%";
    }

    karaokeDuoAnimationId = requestAnimationFrame(updateLevels);
  }

  karaokeDuoAnimationId = requestAnimationFrame(updateLevels);
}

function stopKaraokeDuoLevelMonitor() {
  karaokeDuoMonitorActive = false;

  if (karaokeDuoAnimationId) {
    cancelAnimationFrame(karaokeDuoAnimationId);
    karaokeDuoAnimationId = null;
  }

  const level1 = $("karaokeDuoMic1Level");
  const level2 = $("karaokeDuoMic2Level");
  if (level1) level1.style.width = "0%";
  if (level2) level2.style.width = "0%";
}

function stopKaraokeRecording() {
  if (karaokeMediaRecorder && karaokeMediaRecorder.state !== "inactive") {
    karaokeMediaRecorder.stop();
  }

  // Detener Mic 1
  if (karaokeStream) {
    karaokeStream.getTracks().forEach(t => t.stop());
  }

  // Detener Mic 2 (si existe)
  if (karaokeStream2) {
    karaokeStream2.getTracks().forEach(t => t.stop());
    karaokeStream2 = null;
  }

  // Cerrar contexto de audio dúo
  if (karaokeDuoAudioContext) {
    karaokeDuoAudioContext.close();
    karaokeDuoAudioContext = null;
  }

  karaokeDuoAnalyser1 = null;
  karaokeDuoAnalyser2 = null;

  // Detener el segundo Mic abierto por el modo Dúo Split (si aplica)
  stopP2PitchTracking();

  stopKaraokeDuoLevelMonitor();

  // Ocultar indicador
  const duoIndicator = $("karaokeDuoIndicator");
  if (duoIndicator) {
    duoIndicator.style.display = "none";
  }

  const track = $("karaokeTrack") || $("karaokeAudio") || $("audioKaraoke") || $("trackPlayer");
  if (track) track.pause();

  $("karaokeStartBtn").disabled = false;
}

function restartKaraokeRecording() {
  const track = $("karaokeTrack") || $("karaokeAudio") || $("audioKaraoke") || $("trackPlayer");

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

  if (activeLine && activeLine !== lastActiveLine && autoScrollEnabled) {
    activeLine.scrollIntoView({ behavior: "smooth", block: "center" });
    lastActiveLine = activeLine;
  }
}

async function mixKaraoke() {
  if (!karaokeSelectedTrackBlob || !karaokeRecordedBlob) {
    alert("⚠️ Primero presiona 'Cantar' en un karaoke y luego graba tu voz.");
    return;
  }

  const trackFile = karaokeSelectedTrackBlob; // Ahora contiene la URL de Supabase Storage
  const btn = $("karaokeMixBtn");
  const resultDiv = $("karaokeMixResult");

  btn.textContent = "🎧 Mezclando audios... ⏳";
  btn.disabled = true;
  resultDiv.innerHTML = "<p style='color: var(--text-muted);'>Uniendo la pista y tu voz. Esto puede tardar unos segundos...</p>";

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // 🎯 ¡AQUÍ VA EL NUEVO BLOQUE DE OPTIMIZACIÓN DE SEGURIDAD!
    // Reemplaza las líneas viejas de fetch por estas:
    const peticionOpciones = trackFile.startsWith("http") ? { mode: "cors" } : {};
    const response = await fetch(trackFile, peticionOpciones);
    
    if (!response.ok) {
      throw new Error(`No se pudo descargar el archivo de audio base (Código: ${response.status})`);
    }
    const audioBlobFromCloud = await response.blob();

    // Procesamos el buffer usando el binario recién descargado de internet o catálogo
    const trackArrayBuffer = await audioBlobFromCloud.arrayBuffer();
    const trackBuffer = await audioCtx.decodeAudioData(trackArrayBuffer);

    // Tu voz grabada localmente sigue procesándose igual de rápido
    const voiceArrayBuffer = await karaokeRecordedBlob.arrayBuffer();
    const voiceBuffer = await audioCtx.decodeAudioData(voiceArrayBuffer);

    const offlineCtx = new OfflineAudioContext(
      trackBuffer.numberOfChannels,
      trackBuffer.length,
      trackBuffer.sampleRate
    );

    const trackGain = offlineCtx.createGain();
    trackGain.gain.value = 0.3;

    const trackSource = offlineCtx.createBufferSource();
    trackSource.buffer = trackBuffer;
    trackSource.connect(trackGain);
    trackGain.connect(offlineCtx.destination);

    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.value = 2.8;

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
        <a href="${finalUrl}" download="Mezcla_${karaokeSelectedTrackName || "Karaoke"}.wav" style="flex: 1;">
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
        name: `Mezcla - ${karaokeSelectedTrackName || "Canción"}`,
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
    userVoiceType: "vocalApp_voiceType",
    appTheme: "vocalApp_theme"
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
        
        // Si es el tema, aplicarlo inmediatamente
        if (id === "appTheme") {
          applyAppTheme(e.target.value);
        }
      });
    }
  });

  // Aplicar tema guardado al iniciar
  applyAppTheme(localStorage.getItem("vocalApp_theme") || "oscuro");
}

function applyAppTheme(theme) {
  // Aplicamos el tema al elemento raíz (html)
  document.documentElement.setAttribute("data-theme", theme);
  
  /* También al body por si acaso
  document.body.setAttribute("data-theme", theme);
  */
  
  console.log("🎨 Tema aplicado:", theme);
}

// ==========================================
// GESTIÓN DE MICRÓFONOS
// ==========================================
let micTestStream = null;
let micTestAnalyser = null;
let micTestAnimationId = null;

async function loadAvailableMics() {
  try {
    // Primero pedimos permiso para acceder al micrófono
    await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Luego obtenemos la lista de dispositivos
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");

    const mic1Select = $("mic1Select");
    const mic2Select = $("mic2Select");

    if (mic1Select) {
      mic1Select.innerHTML = "";
      if (mics.length === 0) {
        mic1Select.innerHTML = `<option value="">No se detectaron micrófonos</option>`;
      } else {
        mics.forEach((mic, index) => {
          const option = document.createElement("option");
          option.value = mic.deviceId;
          option.textContent = mic.label || `Micrófono ${index + 1}`;
          mic1Select.appendChild(option);
        });
      }

      // Cargar selección guardada
      const savedMic1 = localStorage.getItem("vocalApp_mic1");
      if (savedMic1) mic1Select.value = savedMic1;
    }

    if (mic2Select) {
      mic2Select.innerHTML = "";
      if (mics.length === 0) {
        mic2Select.innerHTML = `<option value="">No se detectaron micrófonos</option>`;
      } else {
        mics.forEach((mic, index) => {
          const option = document.createElement("option");
          option.value = mic.deviceId;
          option.textContent = mic.label || `Micrófono ${index + 1}`;
          mic2Select.appendChild(option);
        });
      }

      // Cargar selección guardada
      const savedMic2 = localStorage.getItem("vocalApp_mic2");
      if (savedMic2) mic2Select.value = savedMic2;
    }

    console.log("🎙️ Micrófonos detectados:", mics.length);
  } catch (error) {
    console.error("Error al cargar micrófonos:", error);
    
    const mic1Select = $("mic1Select");
    const mic2Select = $("mic2Select");
    
    if (mic1Select) {
      mic1Select.innerHTML = `<option value="">⚠️ Permite acceso al micrófono</option>`;
    }
    if (mic2Select) {
      mic2Select.innerHTML = `<option value="">⚠️ Permite acceso al micrófono</option>`;
    }
  }
}

function toggleMic2Visibility() {
  const micCount = $("micCount");
  const mic2Group = $("mic2Group");

  if (micCount && mic2Group) {
    if (micCount.value === "2") {
      mic2Group.style.display = "block";
    } else {
      mic2Group.style.display = "none";
    }
  }
}

async function testMicrophone(micNumber) {
  // Detener cualquier prueba anterior
  stopMicTest();

  const selectId = micNumber === 1 ? "mic1Select" : "mic2Select";
  const levelId = micNumber === 1 ? "mic1Level" : "mic2Level";

  const select = $(selectId);
  const levelBar = $(levelId);

  if (!select || !levelBar) return;

  const deviceId = select.value;
  if (!deviceId) {
    alert("⚠️ Selecciona un micrófono primero");
    return;
  }

  try {
    const constraints = {
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: { exact: false },
        noiseSuppression: { exact: false },
        autoGainControl: { exact: false },
      }
    };

    micTestStream = await navigator.mediaDevices.getUserMedia(constraints);

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micTestStream);
    micTestAnalyser = audioCtx.createAnalyser();
    micTestAnalyser.fftSize = 2048;
    source.connect(micTestAnalyser);

    const levelFill = levelBar.querySelector(".mic-level-fill");
    if (levelFill) {
      levelFill.classList.add("active");
    }

    function updateLevel() {
      if (!micTestAnalyser) return;

      const dataArray = new Uint8Array(micTestAnalyser.frequencyBinCount);
      micTestAnalyser.getByteFrequencyData(dataArray);

      // Calcular volumen promedio
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const percentage = Math.min(100, (average / 128) * 100);

      if (levelFill) {
        levelFill.style.width = percentage + "%";
      }

      micTestAnimationId = requestAnimationFrame(updateLevel);
    }

    updateLevel();

    // Detener automáticamente después de 5 segundos
    setTimeout(() => {
      stopMicTest();
    }, 5000);

  } catch (error) {
    console.error("Error al probar micrófono:", error);
    alert("❌ No se pudo acceder al micrófono seleccionado");
  }
}

function stopMicTest() {
  if (micTestAnimationId) {
    cancelAnimationFrame(micTestAnimationId);
    micTestAnimationId = null;
  }

  if (micTestStream) {
    micTestStream.getTracks().forEach(track => track.stop());
    micTestStream = null;
  }

  micTestAnalyser = null;

  // Resetear barras de nivel
  const fills = document.querySelectorAll(".mic-level-fill");
  fills.forEach(fill => {
    fill.style.width = "0%";
    fill.classList.remove("active");
  });
}

function saveMicSelection(micNumber) {
  const selectId = micNumber === 1 ? "mic1Select" : "mic2Select";
  const storageKey = micNumber === 1 ? "vocalApp_mic1" : "vocalApp_mic2";

  const select = $(selectId);
  if (select) {
    localStorage.setItem(storageKey, select.value);
    showSaveNotification();
  }
}

// Función helper para obtener el deviceId del mic seleccionado
function getSelectedMicId(micNumber) {
  const selectId = micNumber === 1 ? "mic1Select" : "mic2Select";
  const select = $(selectId);
  return select ? select.value : null;
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
  const text = $("text");
  
  // Determinamos cuál caja de texto está activa y cuál es el ID del elemento actual
  const currentTextInput = lyricsText || text;
  const currentId = selectedVoiceId || selectedTextId;
  const statusId = selectedVoiceId ? "selectedVoiceStatus" : "selectedTextStatus";
  const status = $(statusId);

  if (!currentTextInput) return;

  const correctedText = currentTextInput.value.trim();

  if (!correctedText) {
    alert("⚠️ No hay texto corregido para aplicar.");
    return;
  }

  if (!currentId) {
    alert("❌ No hay ninguna canción o letra seleccionada en el sistema.");
    return;
  }

  try {
    // CORRECCIÓN 1: Enlazamos con la consulta correcta de Supabase
    const item = await getLibraryItemByIdFromSupabase(currentId);
    if (!item) throw new Error("No se encontró el ítem en la base de datos");

    let finalSegments = [];

    // --- BIFURCACIÓN DE FLUJO ---
    if (item.type === "texto") {
      // Pasamos el texto editado por el monitor por el nuevo segmentador de renglones
      finalSegments = segmentarTextoPlano(correctedText);
      
      baseTextSegments = finalSegments;
      textSegments = finalSegments;
      
      renderKaraokeLyrics(textSegments);
      cargarLetrasEnMonitor();

      // Re-inyectamos respetando los saltos de línea manuales modificados
      let textoFormateado = "";
      textSegments.forEach((word, index) => {
        textoFormateado += word.text;
        const nextWord = textSegments[index + 1];
        if (nextWord) {
          textoFormateado += (nextWord.renglon !== word.renglon) ? "\n" : " ";
        }
      });
      
      if (text) text.value = textoFormateado;
      if (lyricsText) lyricsText.value = textoFormateado;
      
      // CORRECCIÓN 2: Guardado de texto plano en Supabase
      await updateLibraryItemFromSupabase(currentId, {
        lyrics: finalSegments,
        isSincronizada: false
      });
    } else {
      // FLUJO ORIGINAL DE IA (Mantiene tu lógica de tiempos de audio previos)
      if (!Array.isArray(baseTranscriptionSegments) || !baseTranscriptionSegments.length) {
        alert("⚠️ Primero debes transcribir la voz antes de aplicar correcciones de audio.");
        return;
      }

      finalSegments = buildSegmentsFromMultilineLyrics(correctedText, baseTranscriptionSegments);

      if (!finalSegments.length) {
        alert("⚠️ No se pudo reconstruir la letra corregida con los tiempos de la IA.");
        return;
      }

      baseTranscriptionSegments = finalSegments;
      transcriptionSegments = finalSegments;

      renderKaraokeLyrics(transcriptionSegments);
      cargarLetrasEnMonitor();

      if (lyricsText) lyricsText.value = transcriptionSegments.map(seg => seg.text || "").join("\n").trim();

      // CORRECCIÓN 3: Guardado de datos de IA en Supabase
      await updateLibraryItemFromSupabase(currentId, {
        transcription: baseTranscriptionSegments
      });
    }

    if (status) {
      status.textContent = "Estado: letra corregida aplicada y guardada ✅";
    }
    alert("✅ Cambios aplicados y guardados correctamente.");
  
  } catch (error) {
    console.error("Error al aplicar la letra corregida:", error);
    if (status) {
      status.textContent = "Estado: Error al guardar las correcciones en la BD";
    }
    alert("❌ No se pudieron salvar las modificaciones del monitor.");
  }
}
// ==========================================
// SINCRONIZACIÓN MANUAL CON TAPS
// ==========================================
function startTapSync() {
  const lyricsText = $("lyricsText");
  const text = $("text");
  const voicePlayer = $("selectedVoicePlayer");
  const trackPlayer = $("player");
  
  // 1. Obtener el método seleccionado por el usuario en el HTML
  const methodSelect = $("tapSyncMethodSelect");
  const modoSeleccionado = methodSelect ? methodSelect.value : "linea"; // "linea" o "palabra"

  const activePlayer = (voicePlayer && voicePlayer.src) ? voicePlayer : trackPlayer;
  const textoActivo = (lyricsText && lyricsText.value.trim()) ? lyricsText.value.trim() : (text ? text.value.trim() : "");
  
  if (!textoActivo) {
    alert("⚠️ Primero escribe, carga o corrige la letra en el área de texto.");
    return;
  }
  
  if (!activePlayer || !activePlayer.src) {
    alert("⚠️ Primero carga un archivo de audio (Pista o Voz) en el Estudio para escuchar y hacer los Taps.");
    return;
  }

  // 2. PROCESAMIENTO SEGÚN EL MODO ELEGIDO POR EL USUARIO
  if (modoSeleccionado === "linea") {
    // Modo Línea por línea: Cortamos por saltos de línea (\n)
    tapSyncLines = textoActivo
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } else {
    // Modo Palabra por palabra: Ignoramos saltos de línea y cortamos por cualquier espacio
    tapSyncLines = textoActivo
      .split(/\s+/)
      .map(palabra => palabra.trim())
      .filter(palabra => palabra.length > 0);
  }
  
  if (tapSyncLines.length === 0) {
    alert("⚠️ No hay elementos de texto válidos para sincronizar.");
    return;
  }

  // Guardar en una propiedad global qué modo se usó en esta sesión de taps
  // Esto es crucial para que applyTapSync() sepa cómo estructurar el guardado final
  window.currentTapSyncModeType = modoSeleccionado;

  // Reiniciar variables globales de control
  tapSyncTimestamps = [];
  tapSyncCurrentIndex = 0;
  tapSyncParts = [];
  currentTapPart = "P1";
  tapSyncMode = true;
  updateTapPartButtonsUI();
  
  if ($("startTapSyncBtn")) $("startTapSyncBtn").style.display = "none";
  if ($("cancelTapSyncBtn")) $("cancelTapSyncBtn").style.display = "inline-block";
  if ($("tapSyncActive")) $("tapSyncActive").style.display = "block";
  if ($("tapSyncResult")) $("tapSyncResult").style.display = "none";
  
  updateTapSyncDisplay();
  
  window.activeTapPlayer = activePlayer;
  activePlayer.currentTime = 0;
  activePlayer.play();
  
  document.removeEventListener("keydown", handleTapSyncKeypress);
  document.addEventListener("keydown", handleTapSyncKeypress);
  
  console.log(`🎯 Sincronización iniciada en modo: [${modoSeleccionado.toUpperCase()}]. Total:`, tapSyncLines.length);
}


function handleTapSyncKeypress(e) {
  if (!tapSyncMode) return;
  
  // Captura barra espaciadora
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    recordTap(); // Ejecuta tu función nativa de marcado de tiempo
    return;
  }
  
  // Atajos para cambiar la parte activa: 1=P1, 2=P2, 3=DÚO
  if (e.key === "1") { setCurrentTapPart("P1"); return; }
  if (e.key === "2") { setCurrentTapPart("P2"); return; }
  if (e.key === "3") { setCurrentTapPart("DUO"); return; }
  
  // Captura tecla Escape para cancelar
  if (e.code === "Escape") {
    cancelTapSync();
  }
}

// Cambia la parte activa (P1/P2/DUO) durante la sincronización
function setCurrentTapPart(part) {
  if (part !== "P1" && part !== "P2" && part !== "DUO") return;
  currentTapPart = part;
  updateTapPartButtonsUI();
}

function updateTapPartButtonsUI() {
  const btnP1 = $("tapPartP1Btn");
  const btnP2 = $("tapPartP2Btn");
  const btnDuo = $("tapPartDuoBtn");
  if (btnP1) btnP1.style.background = (currentTapPart === "P1") ? "#3b82f6" : "#374151";
  if (btnP2) btnP2.style.background = (currentTapPart === "P2") ? "#f97316" : "#374151";
  if (btnDuo) btnDuo.style.background = (currentTapPart === "DUO") ? "#a855f7" : "#374151";
}

// Función para leer el archivo .txt usando Promesas (compatible con async/await)
function leerArchivoTexto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error("Error al leer el archivo de texto"));
    reader.readAsText(file, "UTF-8");
  });
}

// Función para limpiar el texto y segmentarlo palabra por palabra
function segmentarTextoPlano(texto) {
  if (!texto || texto.trim() === "") return [];

  // 1. CORRECCIÓN CLAVE: Limpiamos espacios horizontales dobles, pero RESPETAMOS los saltos de línea (\n)
  const textoLimpio = texto.replace(/[ \t]+/g, ' ').trim();
  
  // 2. Rompemos el texto primero por líneas para saber en qué renglón va cada elemento
  const lineas = textoLimpio.split('\n');
  let palabraGlobalIndex = 1;
  let todasLasPalabras = [];

  lineas.forEach((lineaTexto, renglonIndex) => {
    const lineaLimpia = lineaTexto.trim();
    if (!lineaLimpia) return; // Si es una línea vacía (separación de estrofas), la saltamos

    // Rompemos la línea actual en palabras individuales
    const palabrasDeLaLinea = lineaLimpia.split(' ');

    palabrasDeLaLinea.forEach((palabra) => {
      todasLasPalabras.push({
        id: palabraGlobalIndex++, // ID secuencial para los taps
        text: palabra,
        renglon: renglonIndex + 1, // Guardamos a qué línea de estrofa pertenece originalmente 👈 ¡NUEVO!
        startTime: 0,
        duration: 0,
        pitch: 0
      });
    });
  });

  return todasLasPalabras;
}

function recordTap() {
  if (!tapSyncMode) return;
  
  const player = window.activeTapPlayer || $("selectedVoicePlayer");
  if (!player) return;
  
  const currentTime = player.currentTime;
  
  tapSyncTimestamps.push(currentTime);
  tapSyncParts.push(currentTapPart);
  tapSyncCurrentIndex++;
  
  const tapBtn = $("tapBeatBtn");
  if (tapBtn) {
    tapBtn.style.transform = "scale(0.95)";
    tapBtn.style.background = "linear-gradient(135deg, #16a34a, #14532d)";
    setTimeout(() => {
      tapBtn.style.transform = "scale(1)";
      tapBtn.style.background = "linear-gradient(135deg, #22c55e, #16a34a)";
    }, 100);
  }
  
  if (tapSyncCurrentIndex >= tapSyncLines.length) {
    finishTapSync();
  } else {
    updateTapSyncDisplay();
  }
}

function updateTapSyncDisplay() {
  const currentLineEl = $("tapCurrentLine");
  const progressEl = $("tapProgress");
  
  if (currentLineEl && tapSyncCurrentIndex < tapSyncLines.length) {
    currentLineEl.textContent = tapSyncLines[tapSyncCurrentIndex];
  }
  
  if (progressEl) {
    const tipoUnidad = (window.currentTapSyncModeType === "palabra") ? "palabras" : "líneas";
    progressEl.textContent = `${tapSyncCurrentIndex} / ${tapSyncLines.length} ${tipoUnidad}`;
  }
}

async function finishTapSync() {
  tapSyncMode = false;
  
  const voicePlayer = $("selectedVoicePlayer");
  if (voicePlayer) voicePlayer.pause();
  
  document.removeEventListener("keydown", handleTapSyncKeypress);
  
  if ($("tapSyncActive")) $("tapSyncActive").style.display = "none";
  if ($("tapSyncResult")) $("tapSyncResult").style.display = "block";
  if ($("cancelTapSyncBtn")) $("cancelTapSyncBtn").style.display = "none";
  
  // OBTENER EL ID ACTIVO (Voz o Texto manual) sin conversiones forzadas
  const currentId = selectedVoiceId || selectedTextId;
  if (!currentId) {
    console.error("❌ No se encontró un ID activo para guardar los taps.");
    return;
  }

  try {
    // CORRECCIÓN 1: Enlazamos con la consulta correcta de Supabase
    const item = await getLibraryItemByIdFromSupabase(currentId);
    if (!item) throw new Error("No se pudo obtener el elemento de la biblioteca desde la nube");

    let finalSegments = [];
    
    if (item.type === "texto") {
      const esPalabraPorPalabra = (window.currentTapSyncModeType === "palabra");
      
      if (esPalabraPorPalabra) {
        finalSegments = item.lyrics.map((word, index) => {
          const startTime = tapSyncTimestamps[index] || 0;
          const nextTime = tapSyncTimestamps[index + 1] || (startTime + 0.5);
          return {
            id: word.id,
            text: word.text,
            renglon: word.renglon || 1,
            startTime: startTime,
            duration: Math.max(0.1, nextTime - startTime),
            pitch: word.pitch || 0,
            parte: tapSyncParts[index] || "P1"
          };
        });
      } else {
        // Taps por Línea, pero Almacenamiento PALABRA POR PALABRA
        finalSegments = [];
        let globalWordId = 1;
        
        tapSyncLines.forEach((lineText, lineIndex) => {
          const startTimeFrase = tapSyncTimestamps[lineIndex] || 0;
          const endTimeFrase = tapSyncTimestamps[lineIndex + 1] || (startTimeFrase + 3.0);
          const duracionTotalFrase = endTimeFrase - startTimeFrase;
          const parteLinea = tapSyncParts[lineIndex] || "P1";
          
          const palabrasDeLaLinea = lineText.split(/\s+/).filter(w => w.trim().length > 0);
          const totalPalabras = palabrasDeLaLinea.length;
          
          if (totalPalabras === 0) return;
          const duracionPorPalabra = duracionTotalFrase / totalPalabras;
          
          palabrasDeLaLinea.forEach((palabraText, wordIndex) => {
            const wordStart = startTimeFrase + (wordIndex * duracionPorPalabra);
            
            finalSegments.push({
              id: globalWordId++,
              text: palabraText,
              renglon: lineIndex + 1, 
              startTime: wordStart,
              duration: duracionPorPalabra,
              pitch: 60, 
              parte: parteLinea,
              words: [{
                start: wordStart,
                end: wordStart + duracionPorPalabra,
                word: palabraText,
                midi: 60
              }]
            });
          });
        });
      }
      
      textSegments = finalSegments;
      baseTextSegments = finalSegments;
      
      // CORRECCIÓN 2: Guardamos en Supabase con la nueva función asíncrona
      await updateLibraryItemFromSupabase(currentId, {
        lyrics: finalSegments,
        isSincronizada: true,
        tapModeStyle: window.currentTapSyncModeType
      });
    
    } else {
      // Flujo Original (Voz / IA)
      finalSegments = (item.transcription || []).map((seg, index) => {
        return {
          ...seg,
          startTime: tapSyncTimestamps[index] || seg.startTime
        };
      });
      
      baseTranscriptionSegments = finalSegments;
      transcriptionSegments = finalSegments;

      // CORRECCIÓN 3: Guardamos la transcripción estructurada de la IA en Supabase
      await updateLibraryItemFromSupabase(currentId, {
        transcription: finalSegments
      });
    }

    renderKaraokeLyrics(finalSegments);
    console.log("✅ Sincronización guardada exitosamente en Supabase para el ID:", currentId);
    alert("🎯 ¡Sincronización por Taps completada y guardada en tu Biblioteca!");

  } catch (error) {
    console.error("❌ Error guardando los resultados de los Taps:", error);
    alert("❌ Los taps se registraron pero no se pudieron almacenar en la Base de Datos.");
  }
}

function cancelTapSync() {
  tapSyncMode = false;
  
  const voicePlayer = $("selectedVoicePlayer");
  if (voicePlayer) voicePlayer.pause();
  
  document.removeEventListener("keydown", handleTapSyncKeypress);
  
  if ($("startTapSyncBtn")) $("startTapSyncBtn").style.display = "inline-block";
  if ($("cancelTapSyncBtn")) $("cancelTapSyncBtn").style.display = "none";
  if ($("tapSyncActive")) $("tapSyncActive").style.display = "none";
  if ($("tapSyncResult")) $("tapSyncResult").style.display = "none";
  
  tapSyncLines = [];
  tapSyncTimestamps = [];
  tapSyncParts = [];
  tapSyncCurrentIndex = 0;
}

async function applyTapSync() {
  if (tapSyncTimestamps.length === 0 || tapSyncLines.length === 0) {
    alert("⚠️ No hay datos de sincronización.");
    return;
  }
  
  const voicePlayer = $("selectedVoicePlayer");
  const totalDuration = voicePlayer ? voicePlayer.duration : 0;
  
  const statusId = selectedVoiceId ? "selectedVoiceStatus" : "selectedTextStatus";
  const status = $(statusId);
  
  if (status) status.textContent = "Estado: Aplicando tiempos y analizando notas...";
  
  const newSegments = [];
  const isTextoManual = !selectedVoiceBlob && selectedVoiceId;
  const modoSeleccionado = window.currentTapSyncModeType || "linea";

  // 🎯 BIFURCACIÓN DE MAPEO: EVITA LAS BARRAS GIGANTES EN EL CANVAS
  if (isTextoManual && modoSeleccionado === "linea") {
    let globalWordId = 1;

    tapSyncLines.forEach((lineText, lineIndex) => {
      const startFrase = tapSyncTimestamps[lineIndex] || 0;
      const endFrase = (lineIndex < tapSyncTimestamps.length - 1) ? tapSyncTimestamps[lineIndex + 1] : (totalDuration || startFrase + 3.0);
      const duracionTotalFrase = endFrase - startFrase;
      const parteLinea = tapSyncParts[lineIndex] || "P1";

      const palabrasDeLaLinea = lineText.split(/\s+/).filter(w => w.trim().length > 0);
      const totalPalabras = palabrasDeLaLinea.length;

      if (totalPalabras === 0) return;

      const duracionPorPalabra = duracionTotalFrase / totalPalabras;

      palabrasDeLaLinea.forEach((palabraText, wordIndex) => {
        const wordStart = startFrase + (wordIndex * duracionPorPalabra);
        const wordEnd = wordStart + duracionPorPalabra;

        newSegments.push(buildWordTimingFromSegment({
          start: wordStart,
          end: wordEnd,
          text: palabraText,
          id: globalWordId++,
          renglon: lineIndex + 1,
          parte: parteLinea,
          words: [{
            start: wordStart,
            end: wordEnd,
            word: palabraText,
            midi: 60
          }]
        }));
      });
    });
  } else {
    for (let i = 0; i < tapSyncLines.length; i++) {
      const start = tapSyncTimestamps[i] || 0;
      let end = (i < tapSyncTimestamps.length - 1) ? tapSyncTimestamps[i + 1] : (totalDuration || start + 3);
      
      newSegments.push(buildWordTimingFromSegment({
        start: start,
        end: end,
        text: tapSyncLines[i],
        parte: tapSyncParts[i] || "P1"
      }));
    }
  }
  
  let analyzedSegments = newSegments;
  if (selectedVoiceBlob) {
    if (status) status.textContent = "Estado: Analizando notas musicales... 🎵";
    analyzedSegments = await analyzePitchForSegments(selectedVoiceBlob, selectedTextBlob || null, newSegments);
  }
  
  if (isTextoManual) {
    baseTextSegments = analyzedSegments;
    textSegments = analyzedSegments;
    renderKaraokeLyrics(textSegments);
  } else {
    baseTranscriptionSegments = analyzedSegments;
    transcriptionSegments = analyzedSegments;
    renderKaraokeLyrics(transcriptionSegments);
  }
  
  cargarLetrasEnMonitor();
  
  // 🎤 1. CREAR EL "PAQUETE MAESTRO" EN SUPABASE
  if (studioTrackBlob) {
    try {
      const currentId = selectedVoiceId || selectedTextId;
      const originalItem = currentId ? await getLibraryItemByIdFromSupabase(currentId) : null;

      const karaokeItem = {
        name: `Karaoke - ${studioTrackFileName || "Sin nombre"}`,
        type: "karaoke",
        file_url: studioTrackBlob || (originalItem ? originalItem.file_url : null),
        file_path: originalItem ? originalItem.file_path : null,
        lyrics: analyzedSegments, 
        date: new Date().toISOString(),
        // INYECCIÓN: Guardamos el modo en la columna que acabas de añadir en el panel
        tapModeStyle: modoSeleccionado,
        metadata: { 
          syncedManually: true,
          originalTrack: studioTrackFileName 
        }
      };

      await addLibraryItemToSupabase(karaokeItem);
      console.log("✅ Paquete de Karaoke creado en Supabase.");
    } catch (err) {
      console.error("Error al crear nuevo karaoke:", err);
    }
  }

  // 🎯 2. ACTUALIZAR EL ORIGEN EN SUPABASE
  const currentId = selectedVoiceId || selectedTextId;
  if (currentId) {
    const updateData = { 
      isSincronizada: true,
      type: "karaoke",
      // INYECCIÓN: Actualizamos también el origen con su estilo de visualización correspondiente
      tapModeStyle: modoSeleccionado 
    };

    if (isTextoManual) {
      updateData.lyrics = analyzedSegments;
    } else {
      updateData.transcription = analyzedSegments;
    }

    if (isTextoManual && studioTrackBlob) {
      updateData.file_url = studioTrackBlob;
    }

    try {
      await updateLibraryItemFromSupabase(currentId, updateData);
      console.log("✅ El archivo original se ha convertido en Karaoke.");
    } catch (err) {
      console.error("Error al actualizar origen:", err);
    }
  }

  // 3. LIMPIEZA Y REFRESCO
  await renderLibrary(window.currentFilter || 'todos');
  
  if (typeof loadMyKaraokeSongs === "function") await loadMyKaraokeSongs();

  alert(studioTrackBlob
    ? "¡Karaoke listo! Ahora aparece en la carpeta Karaoke."
    : "Sincronización guardada. (Recuerda que sin pista de audio no se puede crear el archivo final de Karaoke).");
}

function redoTapSync() {
  if ($("tapSyncResult")) $("tapSyncResult").style.display = "none";
  startTapSync();
}

// ==========================================
// INIT
// ==========================================
  
document.addEventListener("DOMContentLoaded", async () => {
  try {
    //await migrateLegacyNames();
    await initSupabase();
    initSettings();

    // Lista con todos tus temas de CSS para poder limpiarlos correctamente
    const allKaraokeThemes = ['theme-clasico', 'theme-moderno', 'theme-disco', 'theme-acustico', 'theme-fiesta'];

    function applyKaraokeTheme() {
      // Si el usuario nunca ha elegido uno, por defecto arranca en 'theme-clasico'
      const theme = localStorage.getItem("vocalApp_stage") || "theme-clasico";
      const monitor = $("karaokeLiveLyrics");
      
      if (monitor) {
        // 1. Quitamos CUALQUIER tema que se haya quedado pegado antes
        monitor.classList.remove(...allKaraokeThemes);
        
        // 2. Agregamos el tema seleccionado manteniendo tu clase base si existe
        monitor.classList.add(theme);
      }
    }

    // Ejecutar al cargar la app para recordar la configuración guardada
    applyKaraokeTheme();

    // Escuchar cambios en el selector de la pestaña de configuración
    safeAdd("karaokeThemeSelect", "change", (e) => {
      // Guarda automáticamente en localStorage (ej: "theme-disco")
      saveSetting("vocalApp_stage", e.target);
      // Aplica el cambio visual inmediatamente en el monitor
      applyKaraokeTheme();
    });

    // navegación
    safeAdd("btnAfinador", "click", () => showTab("afinador"));
    safeAdd("btnEstudio", "click", () => showTab("estudio"));
    safeAdd("btnBiblioteca", "click", () => showTab("biblioteca"));
    safeAdd("btnKaraoke", "click", () => showTab("karaoke"));
    safeAdd("btnCambiarTono", "click", () => {
      showTab("cambiarTono");
      if (typeof loadPitchKaraokeOptions === "function") loadPitchKaraokeOptions();
    });
    safeAdd("btnSplitter", "click", () => showTab("splitter"));
    safeAdd("btnConfig", "click", () => showTab("config"));

    // cambiar tono (pitch shifter)
    safeAdd("refreshPitchKaraokeListBtn", "click", loadPitchKaraokeOptions);
    safeAdd("loadPitchKaraokeBtn", "click", loadSelectedPitchKaraoke);
    safeAdd("pitchUpSelect", "change", onPitchSelectsChange);
    safeAdd("pitchDownSelect", "change", onPitchSelectsChange);
    safeAdd("pitchPlayBtn", "click", playPitchShifted);
    safeAdd("pitchPauseBtn", "click", pausePitchShifted);
    safeAdd("pitchStopBtn", "click", stopPitchShifted);
    safeAdd("pitchSaveBtn", "click", savePitchShiftedToLibrary);
    safeAdd("pitchSendToKaraokeBtn", "click", sendPitchShiftedToKaraokeMonitor);

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

    safeAdd("refreshStudioTextListBtn", "click", loadTextOptionsInStudio);
    safeAdd("loadSelectedTextBtn", "click", loadSelectedTextFromLibrary);
    
    safeAdd("transcribeVoiceBtn", "click", transcribeSelectedVoice);
    safeAdd("applyCorrectedLyricsBtn", "click", applyCorrectedLyrics);

    // Toggle auto-scroll
    safeAdd("toggleAutoScrollBtn", "click", () => {
      autoScrollEnabled = !autoScrollEnabled;
      const btn = $("toggleAutoScrollBtn");
      if (btn) {
        btn.textContent = autoScrollEnabled ? "🔒 Auto-scroll: ON" : "🔓 Auto-scroll: OFF";
        btn.style.background = autoScrollEnabled ? "#f59e0b" : "#6b7280";
      }
    });

    // EVENTO DE SINCRONIZACIÓN AUTOMÁTICA INTELIGENTE (ACTUALIZADO)
    const autoSyncBtn = $("autoSyncBtn");
    if (autoSyncBtn) {
      autoSyncBtn.addEventListener("click", async () => {
        // 1. Evitamos que el usuario haga múltiples clics bloqueando el botón
        autoSyncBtn.disabled = true;
        autoSyncBtn.style.opacity = "0.6";
        const originalText = autoSyncBtn.innerHTML;
        autoSyncBtn.innerHTML = "⏳ Procesando Sincronización...";
        
        try {
          // 2. Ejecutamos la nueva lógica que se conecta a Vercel y calcula el Pitch
          await procesarSincronizacionAutomaticaYPitch();
        } catch (error) {
          console.error("Error en el flujo del botón autoSync:", error);
        } finally {
          // 3. Pase lo que pase (éxito o error), liberamos el botón al terminar
          autoSyncBtn.disabled = false;
          autoSyncBtn.style.opacity = "1";
          autoSyncBtn.innerHTML = originalText;
        }
      });
    }

    // Eventos de sincronización con Taps
    safeAdd("startTapSyncBtn", "click", startTapSync);
    safeAdd("cancelTapSyncBtn", "click", cancelTapSync);
    safeAdd("tapBeatBtn", "click", recordTap);
    safeAdd("applyTapSyncBtn", "click", applyTapSync);
    safeAdd("redoTapSyncBtn", "click", redoTapSync);
    
    // Botones de "Parte activa" (P1/P2/DÚO) durante el TAP sync
    safeAdd("tapPartP1Btn", "click", () => setCurrentTapPart("P1"));
    safeAdd("tapPartP2Btn", "click", () => setCurrentTapPart("P2"));
    safeAdd("tapPartDuoBtn", "click", () => setCurrentTapPart("DUO"));
    
    // Toggle del Modo Dúo Split en el Monitor Karaoke
    safeAdd("karaokeDuoSplitToggleBtn", "click", toggleKaraokeDuoSplitMode);
      
    // Importador .vocalApp
    safeAdd("importvocalAppBtn", "click", () => $("importvocalAppFile")?.click());
    safeAdd("importvocalAppFile", "change", (e) => {
      const file = e.target.files[0];
      if (file) importKaraokeFile(file);
      e.target.value = "";
    });
    
    /*
    // Importador UltraStar
    safeAdd("importUltrastarBtn", "click", openUltrastarModal);
    safeAdd("cancelImportBtn", "click", closeUltrastarModal);
    safeAdd("confirmImportBtn", "click", confirmUltrastarImport);
    safeAdd("ultrastarTxtFile", "change", handleUltrastarTxtChange);
    safeAdd("refreshKaraokeCatalogBtn", "click", async () => {
      await loadKaraokeCatalog();
      await loadMyKaraokeSongs();
    });
      
    // Cerrar modal al hacer clic fuera
    $("ultrastarModal")?.addEventListener("click", (e) => {
      if (e.target.id === "ultrastarModal") {
        closeUltrastarModal();
      }
    });
    */
      
    // Cargar catálogo y mis canciones al iniciar
   // loadKaraokeCatalog();
    loadMyKaraokeSongs();
    
    
    // --- BIBLIOTECA ---
    // Guarda el archivo (audio o texto manual) en el ecosistema Supabase (Storage + Tablas)
    safeAdd("saveLibraryFileBtn", "click", saveManualFileToLibrary);
    
    // Autocompleta el nombre del archivo limpiando la extensión (.txt, .mp3, etc.)
    safeAdd("libraryFileInput", "change", (e) => {
      const file = e.target.files[0];
      const nameInput = $("libraryFileName");
      if (file && nameInput && !nameInput.value.trim()) {
        nameInput.value = file.name.replace(/\.[^.]+$/, "");
      }
    });

    // Filtra la ventana de selección de archivos según lo que elijas en el menú desplegable
    safeAdd("libraryFileType", "change", () => {
      const typeSelect = $("libraryFileType");
      const fileInput = $("libraryFileInput");
      if (typeSelect && fileInput) {
        if (typeSelect.value === "texto") {
          fileInput.setAttribute("accept", ".txt");
        } else {
          fileInput.setAttribute("accept", "audio/*");
        }
      }
    });
    
    // karaoke
    // safeAdd("karaokeTrackFile", "change", cargarPistaKaraoke);
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

    // micrófonos
      safeAdd("refreshMicsBtn", "click", loadAvailableMics);
      safeAdd("testMic1Btn", "click", () => testMicrophone(1));
      safeAdd("testMic2Btn", "click", () => testMicrophone(2));
      safeAdd("mic1Select", "change", () => saveMicSelection(1));
      safeAdd("mic2Select", "change", () => saveMicSelection(2));
      safeAdd("micCount", "change", toggleMic2Visibility);
    
    // Cargar micrófonos al iniciar
      loadAvailableMics();
      toggleMic2Visibility();

    // init
    await renderLibrary('todos');
    await loadTrackOptionsInStudio();
    await loadTrackOptionsInKaraoke();

    // CORRECCIÓN 1: Buscamos de forma segura el reproductor de audio real del Karaoke
    const karaokePlayer = $("karaokeTrack") || $("karaokeAudio") || $("trackPlayer") || $("player");
    
    if (karaokePlayer) {
      // CORRECCIÓN 2: Enlazamos con 'syncKaraokeMonitor', tu función nativa de seguimiento
      karaokePlayer.addEventListener("timeupdate", () => {
        if (typeof syncKaraokeMonitor === "function") {
          syncKaraokeMonitor(karaokePlayer.currentTime);
        }
      });

      karaokePlayer.addEventListener("ended", () => {
        if (typeof syncKaraokeMonitor === "function") {
          syncKaraokeMonitor(karaokePlayer.currentTime);
        }
      });
      
      console.log("🎯 Monitor de tiempo enlazado al reproductor de Karaoke");
    }

  } catch (error) {
    console.error("❌ Error crítico en el arranque de la aplicación:", error);
    alert("❌ Error inicializando la app");
  }
});
// ==========================================
// MONITOR DE KARAOKE (CANVAS)
// ==========================================

// ─── MODO DÚO SPLIT (Toggle + Pitch dual) ───────────────────────────────────
function toggleKaraokeDuoSplitMode() {
  karaokeDuoSplitMode = !karaokeDuoSplitMode;
  const btn = $("karaokeDuoSplitToggleBtn");
  if (btn) {
    btn.textContent = karaokeDuoSplitMode ? "🎤🎤 Modo Dúo Split: ON" : "🎤🎤 Modo Dúo Split: OFF";
    btn.style.background = karaokeDuoSplitMode ? "#22c55e" : "#3b82f6";
  }
  // Re-pintar el canvas para reflejar el cambio aunque no haya pitch activo
  if (typeof drawKaraokeMonitor === "function") {
    const track = $("karaokeTrack");
    const t = track ? track.currentTime : 0;
    drawKaraokeMonitor(t, karaokePitchP1, karaokePitchP2);
  }
}

// Inicia detección de pitch en Mic2 (P2) en paralelo a Mic1. Idempotente.
// Si ya hay un analyser dúo activo (grabación dúo en curso), lo reutiliza
// para evitar abrir un segundo stream al mismo dispositivo (lo que Chrome rechaza).
async function ensureP2PitchTracking() {
  // Reutilizar el analyser de la grabación dúo si está disponible
  if (karaokeDuoAnalyser2 && karaokeDuoAudioContext) {
    karaokeSplitAnalyser2 = karaokeDuoAnalyser2;
    karaokeSplitAudioCtx = karaokeDuoAudioContext;
    return;
  }
  if (karaokeSplitAnalyser2) return;
  try {
    const mic2Id = (typeof getSelectedMicId === "function") ? getSelectedMicId(2) : null;
    if (!mic2Id) {
      console.warn("[DuoSplit] No hay Mic 2 seleccionado; el rastro P2 no se podrá dibujar.");
      return;
    }
    if (!karaokeSplitAudioCtx) {
      karaokeSplitAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    karaokeSplitStream2 = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: mic2Id }, echoCancellation: { exact: false }, noiseSuppression: { exact: false }, autoGainControl: { exact: false }}
    });
    const src2 = karaokeSplitAudioCtx.createMediaStreamSource(karaokeSplitStream2);
    karaokeSplitAnalyser2 = karaokeSplitAudioCtx.createAnalyser();
    karaokeSplitAnalyser2.fftSize = 2048;
    src2.connect(karaokeSplitAnalyser2);
    console.log("[DuoSplit] Pitch tracking del Mic 2 iniciado");
  } catch (e) {
    console.warn("No se pudo iniciar pitch del Mic 2 (P2):", e);
  }
}

function stopP2PitchTracking() {
  try {
    // Sólo paramos el stream si NOSOTROS lo abrimos (no si lo prestamos del flujo dúo)
    if (karaokeSplitStream2) {
      karaokeSplitStream2.getTracks().forEach(t => t.stop());
    }
  } catch (e) {}
  karaokeSplitStream2 = null;
  karaokeSplitAnalyser2 = null;
  karaokePitchP2 = -1;
  pitchHistoryP2 = [];
}

function drawKaraokeMonitor(currentTime, currentFreq, currentFreq2) {
  const canvas = $("karaokeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const hueFiesta = (currentTime * 50) % 360;
  const paleta = obtenerPaletaTema(hueFiesta);

  // Guardamos pitch global para repintados manuales (toggle, etc.)
  if (typeof currentFreq === "number") karaokePitchP1 = currentFreq;
  if (typeof currentFreq2 === "number") karaokePitchP2 = currentFreq2;

  // --- CONFIGURACIÓN COMÚN ---
  const MIDI_MIN = 36;
  const MIDI_MAX = 84;
  const lineX = 80; // Línea roja (Ahora)
  const pixelsPerSecond = (canvas.width - 50) / 7;

  function obtenerPaletaTema(hue = 0) {
    const temaActual = localStorage.getItem("vocalApp_stage") || "theme-clasico";
    let config = { fondo: "#111827", lineas: "#333333", etiquetas: "#666666", barraFutura: "#1e40af", bordeFuturo: "#3b82f6", tamanoTexto: "15px" };
    switch (temaActual) {
      case "theme-moderno":
        config = { fondo: "#082f49", lineas: "rgba(6, 182, 212, 0.2)", etiquetas: "#06b6d4", barraFutura: "#1e3a8a", bordeFuturo: "#06b6d4", tamanoTexto: "16px" };
        break;
      case "theme-disco":
        config = { fondo: "#2e1065", lineas: "rgba(219, 39, 119, 0.25)", etiquetas: "#facc15", barraFutura: "#701a75", bordeFuturo: "#db2777", tamanoTexto: "18px" };
        break;
      case "theme-acustico":
        config = { fondo: "#451a03", lineas: "rgba(120, 53, 15, 0.4)", etiquetas: "#fcd34d", barraFutura: "#78350f", bordeFuturo: "#b45309", tamanoTexto: "14px" };
        break;
      case "theme-fiesta":
        config = {
          fondo: `hsl(${hue}, 40%, 12%)`,
          lineas: "rgba(255, 255, 255, 0.15)",
          etiquetas: "#ff007f",
          barraFutura: `hsl(${(hue + 180) % 360}, 50%, 25%)`,
          bordeFuturo: `hsl(${(hue + 180) % 360}, 70%, 50%)`,
          tamanoTexto: "19px"
        };
        break;
    }
    return config;
  }

  // 1. LIMPIAR TODO EL CANVAS
  ctx.fillStyle = paleta.fondo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fuente de datos (palabras con tiempos)
  const datos = (textSegments && textSegments.length > 0) ? textSegments : transcriptionSegments;

  // Offset extra cuando hay etiqueta de avatar (split mode): empuja pentagrama,
  // notas y línea "ahora" a la derecha para dejar espacio al bloque vertical.
  const AVATAR_BLOCK_W = karaokeDuoSplitMode ? 110 : 0;
  const noteLabelsX = 28 + AVATAR_BLOCK_W;
  const pentagramStartX = 35 + AVATAR_BLOCK_W;
  const dynLineX = lineX + AVATAR_BLOCK_W;

  // Pinta un bloque vertical: nombre arriba, avatar emoji al centro,
  // y una fila inferior con 2 íconos al lado (mitad del tamaño del avatar).
  // SIN sombra de fondo, SIN círculo detrás del avatar.
  function drawAvatarBlock(pTop, pBottom, parte) {
    if (!parte || parte === "DUO") return;
    const isP1 = (parte === "P1");
    const nombre = isP1 ? "Wen-dolyne" : "To-bonito";
    // P1: mujer. P2: persona con barba + piel morena (forma compacta sin ZWJ
    // para evitar que algunos sistemas pinten un ♂ extra al lado).
    const avatarEmoji = isP1 ? "👩" : "🧔🏾";

    const cx = 5 + AVATAR_BLOCK_W / 2;
    const blockTop = pTop + 10;
    const avatarSize = 56;
    const halfSize = 28; // mitad del tamaño original del cuadrado
    const nameH = 22;
    const gap = 6;

    // 1) Nombre (arriba)
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(nombre, cx, blockTop + nameH - 4);

    // 2) Avatar emoji (centro, sin círculo de fondo)
    const avTop = blockTop + nameH + gap;
    ctx.font = `${avatarSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(avatarEmoji, cx, avTop + avatarSize / 2);

    // 3) Fila inferior con dos íconos al lado (cada uno de halfSize)
    const rowTop = avTop + avatarSize + gap;
    const iconHalfFont = `${halfSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",Arial`;

    if (isP1) {
      // Izquierda: cuadrado morado (mitad de tamaño)
      const sqX = cx - halfSize - gap / 2;
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(sqX, rowTop, halfSize, halfSize);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1;
      ctx.strokeRect(sqX, rowTop, halfSize, halfSize);
      // Derecha: átomo ⚛️
      ctx.font = iconHalfFont;
      ctx.fillStyle = "white";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("⚛️", cx + halfSize / 2 + gap / 2, rowTop + halfSize / 2);
    } else {
      // Izquierda: cara de gato 🐱 (mitad de tamaño)
      ctx.font = iconHalfFont;
      ctx.fillStyle = "white";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("🐱", cx - halfSize / 2 - gap / 2, rowTop + halfSize / 2);
      // Derecha: hombre pensante 🤔
      ctx.fillText("🤔", cx + halfSize / 2 + gap / 2, rowTop + halfSize / 2);
    }

    // Reset baseline para no romper otros dibujos
    ctx.textBaseline = "alphabetic";
  }

  // Helper interno: dibuja un pentagrama+barras+pitch en una región vertical [pTop, pBottom]
  // parteFiltro: "P1" | "P2" | null (sin filtro). Las palabras "DUO" siempre se dibujan.
  function drawRegion(pTop, pBottom, pitchVal, pitchHist, parteFiltro, etiquetaParte) {
    const pHeight = pBottom - pTop;
    const midiToY = (midi) => {
      const val = (midi && midi > 0) ? midi : 60;
      const normalized = (MIDI_MAX - val) / (MIDI_MAX - MIDI_MIN);
      return pTop + (normalized * pHeight);
    };

    // Avatar block (sólo en split mode)
    drawAvatarBlock(pTop, pBottom, etiquetaParte);

    // Pentagrama
    ctx.strokeStyle = paleta.lineas;
    ctx.lineWidth = 1;
    const numLines = 10;
    for (let i = 0; i <= numLines; i++) {
      const y = pTop + (pHeight / numLines) * i;
      ctx.beginPath();
      ctx.moveTo(pentagramStartX, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Notas a la izquierda
    ctx.fillStyle = paleta.etiquetas;
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "right";
    const noteLabels = ["C6", "A5", "F5", "D5", "B4", "G4", "E4", "C4", "A3", "F3", "D3", "C3"];
    noteLabels.forEach((label, i) => {
      const y = pTop + (pHeight / numLines) * i + 7;
      ctx.fillText(label, noteLabelsX, y);
    });

    // Etiqueta de parte (P1 / P2) en la esquina superior izquierda de la región
    // (etiqueta P1/P2 antigua removida: el avatar block ya identifica la región)

    // Barras de notas (filtradas por parte si aplica)
    if (Array.isArray(datos) && datos.length > 0) {
      datos.forEach((seg) => {
        // Filtrado por parte: en modo split, dibujamos solo las palabras de esta parte (DUO va en ambas)
        const parteSeg = seg.parte || "P1";
        if (parteFiltro && parteSeg !== parteFiltro && parteSeg !== "DUO") return;

        const words = Array.isArray(seg.words) ? seg.words : [];
        words.forEach(w => {
          const start = w.start || w.startTime || seg.start || 0;
          const end = w.end || (start + (w.duration || 0.5));
          if (end < currentTime - 1 || start > currentTime + (canvas.width / pixelsPerSecond)) return;

          const x = dynLineX + (start - currentTime) * pixelsPerSecond;
          const width = (end - start) * pixelsPerSecond;
          const midi = w.midi || seg.midi || 60;
          const y = midiToY(midi);
          const h = 24;

          const isActive = currentTime >= start && currentTime <= end;
          const isPast = currentTime > end;

          let barColor = paleta.barraFutura;
          let strokeColor = paleta.bordeFuturo;

          // En DUO usamos un tinte violeta para diferenciar visualmente
          if (parteSeg === "DUO") {
            barColor = "#7c3aed";
            strokeColor = "#a855f7";
          } else if (parteSeg === "P2") {
            barColor = "#9a3412";
            strokeColor = "#f97316";
          }

          if (isPast) barColor = "#4b5563";

          if (isActive) {
            const userMidi = Math.round(12 * Math.log2(pitchVal / 440) + 69);
            const isCorrect = pitchVal > 0 && Math.abs(userMidi - midi) <= 2;
            barColor = isCorrect ? "#22c55e" : strokeColor;
            strokeColor = "white";
          }

          ctx.fillStyle = barColor;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, y - h / 2, Math.max(width, 25), h, 5);
          else ctx.fillRect(x, y - h / 2, Math.max(width, 25), h);
          ctx.fill();

          if (isActive || !isPast) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = isActive ? 3 : 1;
            ctx.stroke();
          }

          ctx.fillStyle = "white";
          ctx.font = `bold ${paleta.tamanoTexto || "15px"} Arial`;
          ctx.textAlign = "center";
          ctx.fillText(w.word || w.text || "", x + Math.max(width, 25) / 2, y + 5);
        });
      });
    }

    // Rastro de pitch y punto del usuario (por región)
    if (pitchVal > 0) {
      const userMidi = Math.round(12 * Math.log2(pitchVal / 440) + 69);
      const userY = midiToY(userMidi);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
      ctx.lineWidth = 4;
      let started = false;
      pitchHist.forEach((f, i) => {
        if (f) {
          const x = dynLineX - (pitchHist.length - i) * 3;
          const yPos = midiToY(Math.round(12 * Math.log2(f / 440) + 69));
          if (x < pentagramStartX) return;
          if (!started) { ctx.moveTo(x, yPos); started = true; } else { ctx.lineTo(x, yPos); }
        }
      });
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "#facc15";
      ctx.arc(dynLineX, userY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Línea roja (Ahora) que cruza solo esta región
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dynLineX, pTop - 2);
    ctx.lineTo(dynLineX, pBottom + 2);
    ctx.stroke();
  }

  // 2. Renderizar según modo (Single vs Dúo Split)
  if (karaokeDuoSplitMode) {
    // Dos regiones apiladas: P1 arriba, P2 abajo. Teleprompter compartido al fondo.
    const TELE_H = 100;
    const GAP = 14;
    const totalUsable = canvas.height - TELE_H - 20;
    const regionH = (totalUsable - GAP) / 2;
    const topP1 = 20;
    const bottomP1 = topP1 + regionH;
    const topP2 = bottomP1 + GAP;
    const bottomP2 = topP2 + regionH;

    // Historial de cada parte
    pitchHistoryP1.push(currentFreq > 0 ? currentFreq : null);
    if (pitchHistoryP1.length > 60) pitchHistoryP1.shift();
    pitchHistoryP2.push(currentFreq2 > 0 ? currentFreq2 : null);
    if (pitchHistoryP2.length > 60) pitchHistoryP2.shift();

    // Línea divisoria sutil entre regiones
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, bottomP1, canvas.width, GAP);

    drawRegion(topP1, bottomP1, currentFreq, pitchHistoryP1, "P1", "P1");
    drawRegion(topP2, bottomP2, currentFreq2, pitchHistoryP2, "P2", "P2");
  } else {
    // Modo clásico: una sola región a todo lo alto (sin filtro de parte)
    const P_TOP = 40;
    const P_BOTTOM = canvas.height - 110;

    if (typeof pitchHistory !== 'undefined') {
      pitchHistory.push(currentFreq > 0 ? currentFreq : null);
      if (pitchHistory.length > 60) pitchHistory.shift();
    }
    drawRegion(P_TOP, P_BOTTOM, currentFreq, pitchHistory, null, null);
  }

  // 3. TELEPROMPTER DOBLE LÍNEA (Abajo, siempre visible)
  if (Array.isArray(datos) && datos.length > 0) {
    const idx = datos.findIndex(s => currentTime >= (s.start || 0) && currentTime <= (s.end || (s.start + 1)));
    if (idx !== -1) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

      ctx.textAlign = "center";
      ctx.fillStyle = "white";
      ctx.font = "bold 30px Arial";

      // En split, mostramos también la parte cantando
      const parteActual = datos[idx].parte || "P1";
      const prefijo = karaokeDuoSplitMode ? (parteActual === "DUO" ? "🟪 DÚO · " : (parteActual === "P2" ? "🟧 P2 · " : "🟦 P1 · ")) : "";
      ctx.fillText(prefijo + (datos[idx].text || ""), canvas.width / 2, canvas.height - 65);

      if (datos[idx + 1]) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "italic 22px Arial";
        ctx.fillText(datos[idx + 1].text || "", canvas.width / 2, canvas.height - 25);
      }
    }
  }
}
  
// ==========================================
// DETECCIÓN DE PITCH PARA KARAOKE
// ==========================================
  
async function startKaraokePitchDetection() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Obtener micrófono seleccionado
  const micId = getSelectedMicId(1);
    
  const audioConstraints = { 
    audio: micId ? { deviceId: { exact: micId } } : true 
  };
    
  const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
  const mic = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  mic.connect(analyser);

  // Si el Modo Dúo Split está activo, intentamos abrir Mic 2 en paralelo
  if (karaokeDuoSplitMode) {
    await ensureP2PitchTracking();
  }

  function loop() {
    const track = $("karaokeTrack") || $("karaokeAudio") || $("audioKaraoke") || $("trackPlayer");
    const currentTime = track ? track.currentTime : 0;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    const pitch = autoCorrelate(buffer, audioCtx.sampleRate);

    // Pitch del Mic 2 (P2) si está disponible
    let pitch2 = -1;
    if (karaokeDuoSplitMode && karaokeSplitAnalyser2) {
      const buf2 = new Float32Array(karaokeSplitAnalyser2.fftSize);
      karaokeSplitAnalyser2.getFloatTimeDomainData(buf2);
      pitch2 = autoCorrelate(buf2, karaokeSplitAudioCtx.sampleRate);
    }

    drawKaraokeMonitor(currentTime, pitch, pitch2);

    // Si la pista terminó, paramos
    if (track && track.ended) return;

    // Seguimos el loop mientras se graba
    if (karaokeMediaRecorder && karaokeMediaRecorder.state === "recording") {
      requestAnimationFrame(loop);
    }
  }
  loop();
}

/*
// ==========================================
// IMPORTADOR ULTRASTAR
// ==========================================
let parsedUltrastar = null;

function openUltrastarModal() {
  const modal = $("ultrastarModal");
  if (modal) {
    modal.style.display = "flex";
    // Limpiar campos
    $("ultrastarTxtFile").value = "";
    $("ultrastarAudioFile").value = "";
    $("ultrastarVocalsFile").value = "";
    $("ultrastarPreview").style.display = "none";
    parsedUltrastar = null;
  }
}

function closeUltrastarModal() {
  const modal = $("ultrastarModal");
  if (modal) {
    modal.style.display = "none";
    parsedUltrastar = null;
  }
}
*/

function parseUltrastarTxt(content) {
  const lines = content.split("\n");
  const metadata = {};
  const notes = [];
  
  let currentBeat = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Metadatos (líneas que empiezan con #)
    if (trimmed.startsWith("#")) {
      const match = trimmed.match(/^#(\w+):(.*)$/);
      if (match) {
        const key = match[1].toUpperCase();
        const value = match[2].trim();
        metadata[key] = value;
      }
      continue;
    }
    
    // Notas (líneas que empiezan con :, *, F, o -)
    if (trimmed.match(/^[:*F-]/)) {
      const parts = trimmed.split(/\s+/);
      const type = parts[0]; // : = normal, * = golden, F = freestyle, - = line break
      
      if (type === "-") {
        // Line break - marca fin de línea
        continue;
      }
      
      if (parts.length >= 4) {
        const startBeat = parseInt(parts[1], 10);
        const duration = parseInt(parts[2], 10);
        const pitch = parseInt(parts[3], 10);
        const syllable = parts.slice(4).join(" ");
        
        notes.push({
          type: type,
          startBeat: startBeat,
          duration: duration,
          pitch: pitch, // Nota MIDI relativa
          syllable: syllable
        });
      }
    }
  }
  
  return {
    title: metadata.TITLE || "Sin título",
    artist: metadata.ARTIST || "Desconocido",
    bpm: parseFloat(metadata.BPM) || 120,
    gap: parseFloat(metadata.GAP) || 0, // Milisegundos antes de la primera nota
    videoGap: parseFloat(metadata.VIDEOGAP) || 0,
    genre: metadata.GENRE || "",
    language: metadata.LANGUAGE || "",
    year: metadata.YEAR || "",
    notes: notes
  };
}

function ultrastarToSegments(parsed) {
  if (!parsed || !parsed.notes || !parsed.notes.length) {
    return [];
  }
  
  const bpm = parsed.bpm;
  const gap = parsed.gap / 1000; // Convertir a segundos
  const beatDuration = 60 / bpm / 4; // Duración de un beat en segundos (UltraStar usa quarter beats)
  
  // Agrupar sílabas en líneas/palabras
  const segments = [];
  let currentSegment = null;
  let currentWords = [];
  let lastEndBeat = 0;
  
  for (let i = 0; i < parsed.notes.length; i++) {
    const note = parsed.notes[i];
    
    const startTime = gap + (note.startBeat * beatDuration);
    const endTime = startTime + (note.duration * beatDuration);
    const midiNote = 60 + note.pitch; // UltraStar usa pitch relativo, base = C4 (60)
    
    // Detectar si hay un salto grande (nueva línea)
    const gapFromLast = note.startBeat - lastEndBeat;
    
    if (gapFromLast > 8 && currentWords.length > 0) {
      // Guardar segmento anterior
      if (currentWords.length > 0) {
        segments.push({
          start: currentWords[0].start,
          end: currentWords[currentWords.length - 1].end,
          text: currentWords.map(w => w.word).join(""),
          words: currentWords,
          pitch: currentWords[0].pitch,
          midi: currentWords[0].midi,
          note: currentWords[0].note
        });
      }
      currentWords = [];
    }
    
    // Agregar palabra/sílaba
    currentWords.push({
      word: note.syllable,
      start: startTime,
      end: endTime,
      pitch: midiToFrequency(midiNote),
      midi: midiNote,
      note: getNoteFromFrequency(midiToFrequency(midiNote))
    });
    
    lastEndBeat = note.startBeat + note.duration;
  }
  
  // Agregar último segmento
  if (currentWords.length > 0) {
    segments.push({
      start: currentWords[0].start,
      end: currentWords[currentWords.length - 1].end,
      text: currentWords.map(w => w.word).join(""),
      words: currentWords,
      pitch: currentWords[0].pitch,
      midi: currentWords[0].midi,
      note: currentWords[0].note
    });
  }
  
  return segments;
}


async function handleUltrastarTxtChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const content = await file.text();
    parsedUltrastar = parseUltrastarTxt(content);
    
    // Mostrar preview
    $("ultrastarTitle").innerHTML = `<strong>Título:</strong> ${parsedUltrastar.title}`;
    $("ultrastarArtist").innerHTML = `<strong>Artista:</strong> ${parsedUltrastar.artist}`;
    $("ultrastarBpm").innerHTML = `<strong>BPM:</strong> ${parsedUltrastar.bpm}`;
    $("ultrastarNotes").innerHTML = `<strong>Notas:</strong> ${parsedUltrastar.notes.length} sílabas`;
    $("ultrastarPreview").style.display = "block";
    
    console.log("📄 UltraStar parseado:", parsedUltrastar);
  } catch (error) {
    console.error("Error parseando UltraStar:", error);
    alert("❌ Error al leer el archivo. Verifica que sea un .txt de UltraStar válido.");
  }
}

async function confirmUltrastarImport() {
  if (!parsedUltrastar) {
    alert("⚠️ Primero selecciona un archivo .txt de UltraStar");
    return;
  }
  
  const audioFile = $("ultrastarAudioFile").files[0];
  if (!audioFile) {
    alert("⚠️ Selecciona el archivo de audio de la canción");
    return;
  }
  
  const vocalsFile = $("ultrastarVocalsFile").files[0];
  
  try {
    // Convertir notas a nuestro formato de segmentos
    const segments = ultrastarToSegments(parsedUltrastar);
    
    if (segments.length === 0) {
      alert("⚠️ No se pudieron extraer las notas del archivo");
      return;
    }
    
    // CORRECCIÓN 1: Guardar pista instrumental en Supabase (Storage + Tabla)
    await saveLibraryItemToSupabase({
      name: `Pista - ${parsedUltrastar.title} (${parsedUltrastar.artist})`,
      type: "pista",
      blob: audioFile, // Cambiado 'audioBlob' a 'blob' para que calce con tu subidor de Storage
      date: new Date().toISOString() // Cambiado a formato ISO estándar
    });

    // Si hay voz separada, guardarla también en la nube
    if (vocalsFile) {
      // CORRECCIÓN 2: Guardar archivo de voz con su transcripción en Supabase
      await saveLibraryItemToSupabase({
        name: `Voz - ${parsedUltrastar.title} (${parsedUltrastar.artist})`,
        type: "voz",
        blob: vocalsFile,
        date: new Date().toISOString(),
        transcription: segments
      });
    } 
    
    // CORRECCIÓN 3: Guardar el paquete de "karaoke listo" final en la nube
    // Pasamos el audio base (audioFile) para que se aloje en el Storage y genere su file_url
    await saveLibraryItemToSupabase({
      name: `${parsedUltrastar.title} - ${parsedUltrastar.artist}`,
      type: "karaoke",
      blob: audioFile, 
      date: new Date().toISOString(),
      transcription: segments,
      metadata: {
        title: parsedUltrastar.title,
        artist: parsedUltrastar.artist,
        bpm: parsedUltrastar.bpm,
        genre: parsedUltrastar.genre,
        language: parsedUltrastar.language,
        year: parsedUltrastar.year,
        hasVocalsSeparated: !!vocalsFile // Metadato de control opcional para saber si hay voz
      }
    });
    
    // Actualizar biblioteca y listas desde la base de datos remota
    await renderLibrary("todos");
    if (typeof loadMyKaraokeSongs === "function") await loadMyKaraokeSongs();
    
    // Cerrar modal
    closeUltrastarModal();
    
    alert(`✅ ¡"${parsedUltrastar.title}" importada exitosamente!\n\nLa encontrarás en "Mis Canciones" lista para cantar.`);
    
  } catch (error) {
    console.error("Error importando:", error);
    alert("❌ Error al importar la canción. Revisa la consola para más detalles.");
  }
}

/*
// ==========================================
// CATÁLOGO Y MIS CANCIONES
// ==========================================
  
async function loadKaraokeCatalog() {
  const container = $("catalogList");
  if (!container) return;
  
  container.innerHTML = `<p style="color: var(--text-muted);">Cargando catálogo...</p>`;
  
  try {
    // Cargar el catálogo desde el repositorio
    const response = await fetch("./karaoke-catalog/catalog.json");
    
    if (!response.ok) {
      throw new Error("No se pudo cargar el catálogo");
    }
    
    const catalog = await response.json();
    
    if (!catalog.songs || catalog.songs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
          <p>📚 El catálogo está vacío.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = "";
    
    catalog.songs.forEach(song => {
      const div = document.createElement("div");
      div.className = "catalog-item";
      
      div.innerHTML = `
        <div class="catalog-item-info">
          <p class="catalog-item-title">🎵 ${song.title}</p>
          <p class="catalog-item-artist">${song.artist}</p>
        </div>
        <div class="catalog-item-actions">
          <button type="button" class="load-catalog-btn" data-folder="${song.folder}" data-title="${song.title}" data-artist="${song.artist}" style="background: #22c55e;">▶️ Cantar</button>
        </div>
      `;
      
      container.appendChild(div);
    });
    
    // Agregar eventos a los botones
    container.querySelectorAll(".load-catalog-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        loadCatalogSong(btn.dataset.folder, btn.dataset.title, btn.dataset.artist);
      });
    });
    
    console.log("📚 Catálogo cargado:", catalog.songs.length, "canciones");
    
  } catch (error) {
    console.error("Error cargando catálogo:", error);
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted);">
        <p>📚 No se pudo cargar el catálogo.</p>
        <p style="font-size: 13px;">Importa canciones de UltraStar o crea las tuyas en Estudio.</p>
      </div>
    `;
  }
}
*/
async function loadCatalogSong(folder, title, artist) {
  const status = $("karaokeStatus");
  
  try {
    if (status) status.textContent = `Estado: Cargando "${title}"...`;
    
    // Cargar el archivo de sincronización .txt
    const syncResponse = await fetch(`./karaoke-catalog/${folder}/sync.txt`);
    if (!syncResponse.ok) {
      throw new Error("No se pudo cargar la sincronización");
    }
    const syncContent = await syncResponse.text();
    
    // Parsear el archivo UltraStar
    const parsed = parseUltrastarTxt(syncContent);
    const segments = ultrastarToSegments(parsed);
    
    if (segments.length === 0) {
      throw new Error("No se pudieron extraer las notas");
    }
    
    // Generamos la URL local del archivo del catálogo en vez de descargar un Blob pesado
    const audioUrl = `./karaoke-catalog/${folder}/audio.mp3`;
    
    // Configurar el reproductor multimedia
    const track = $("karaokeTrack") || $("karaokeAudio") || $("audioKaraoke") || $("trackPlayer");
    if (track) {
      track.src = audioUrl;
      track.volume = 0.4;
      
      // Sincronizamos las variables globales usando la ruta del archivo
      karaokeSelectedTrackBlob = audioUrl;
      karaokeSelectedTrackName = `${title} - ${artist}`;
      track.load();
    }
    
    // Configurar la sincronización de las letras
    transcriptionSegments = segments;
    baseTranscriptionSegments = segments;
    cargarLetrasEnMonitor();
    
    if (status) status.textContent = `Estado: "${title}" cargada. ¡Lista para cantar! 🎤`;
    
    // Desplazamiento visual suave
    const canvas = $("karaokeCanvas");
    if (canvas) {
      canvas.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    
    console.log("✅ Canción del catálogo cargada con éxito:", title);
    
  } catch (error) {
    console.error("Error cargando canción del catálogo:", error);
    if (status) status.textContent = `Estado: Error al cargar "${title}"`;
    alert(`❌ Error al cargar la canción: ${error.message}`);
  }
}

// ==========================================
// 2. LISTAR CANCIONES DESDE LA NUBE
// ==========================================
async function loadMyKaraokeSongs() {
  const container = $("myKaraokeList");
  if (!container) return;
  
  try {
    // Traemos los karaokes listos de Supabase
    const allSongs = await getLibraryItemsByTypeFromSupabase("karaoke");
    
    if (allSongs.length === 0) {
      container.innerHTML = `
        <div class="empty-message">
          <p>No tienes canciones listas aún.</p>
          <p>Sincroniza una pista en la pestaña Estudio para verla aquí.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = "";
    
    allSongs.forEach(song => {
      const div = document.createElement("div");
      div.className = "my-karaoke-item card"; 
      
      const title = song.metadata?.title || song.name || "Sin título";
      const artist = song.metadata?.artist || "Artista desconocido";
      
      div.innerHTML = `
        <div class="my-karaoke-item-info">
          <p class="my-karaoke-item-title">🎤 ${title}</p>
          <p class="my-karaoke-item-artist">${artist}</p>
        </div>
        <div class="my-karaoke-item-actions">
          <!-- Guardamos el ID de Supabase intacto (funciona para números o textos UUID) -->
          <button type="button" class="btn-play" data-id="${song.id}">▶️ Cantar</button>
          <button type="button" class="btn-share" data-id="${song.id}" title="Exportar">📤</button>
          <button type="button" class="btn-delete" data-id="${song.id}">🗑️</button>
        </div>
      `;
      container.appendChild(div);
    });
  
    // Asignación de eventos limpia y centralizada
    configurarEventosListaKaraoke(container);
    
  } catch (error) {
    console.error("Error al cargar lista de karaoke:", error);
    container.innerHTML = `<p class="error">❌ No se pudieron cargar tus canciones.</p>`;
  }
}

// ==========================================
// 3. EVENTOS DE LA LISTA DE KARAOKE
// ==========================================
function configurarEventosListaKaraoke(container) {
  // Eliminamos el listener previo para evitar ejecuciones duplicadas si se refresca la lista
  const nuevoContainer = container.cloneNode(true);
  container.parentNode.replaceChild(nuevoContainer, container);

  nuevoContainer.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    
    // CORRECCIÓN 1: Quitamos Number() para mantener compatibilidad con UUIDs de Supabase
    const id = btn.dataset.id; 
    
    if (btn.classList.contains("btn-play")) {
      await loadKaraokeSong(id);
    } else if (btn.classList.contains("btn-share")) {
      if (typeof exportKaraokeSong === "function") exportKaraokeSong(id);
    } else if (btn.classList.contains("btn-delete")) {
      // CORRECCIÓN 2: Enlazamos con tu gestor seguro con confirm() en lugar de borrar directo
      if (typeof deleteLibraryItem === "function") {
        await deleteLibraryItem(id, 'karaoke');
        await loadMyKaraokeSongs(); // Refrescamos la lista actual de karaoke
      }
    }
  });
}

// ==========================================
// 4. REPRODUCIR CANCIÓN DE KARAOKE DESDE LA NUBE
// ==========================================
let currentKaraokeAudioURL = null; // Mantenemos tu variable de control local
  
async function loadKaraokeSong(id) {
  try {
    // 1. Limpiamos la memoria de los monitores antes de cargar el nuevo tema
    if (typeof limpiarVariablesMonitor === "function") {
      limpiarVariablesMonitor();
    }

    // Solicitamos el registro a Supabase
    const item = await getLibraryItemByIdFromSupabase(id);
    if (!item) {
      alert("⚠️ No se encontró el karaoke.");
      return;
    }

    // Validamos usando la URL de la nube 'file_url' que generó tu Storage
    const urlAudioCloud = item.file_url || item.karaoke;
    if (!urlAudioCloud) {
      alert("⚠️ Este karaoke no tiene audio en la nube.");
      return;
    }

    // Sincronizamos los datos con tus variables globales
    karaokeLoadedItem = item;
    karaokeSelectedTrackBlob = urlAudioCloud; // Guardamos el enlace directo de internet
    karaokeSelectedTrackName = item.name || "Karaoke";

    // 🎯 INYECCIÓN GLOBAL: Recuperamos el estilo de tap guardado en tu columna de Supabase
    // Esto le avisa a tu Canvas/Monitor cómo debe iluminar el texto (línea o palabra)
    window.currentTapSyncModeType = item.tapModeStyle || "linea";

    const track = $("karaokeTrack") || $("karaokeAudio") || $("audioKaraoke") || $("trackPlayer");
    if (track) {
      try { track.pause(); } catch (e) {}
      track.currentTime = 0;

      // Asignamos el enlace directo del streaming web eliminando createObjectURL
      track.src = urlAudioCloud;
      track.dataset.objectUrl = ""; // Ya no aplica localmente
      track.dataset.karaokeId = String(item.id);
      track.dataset.karaokeLoaded = "1";
      track.volume = 0.4;
      track.load();
    }

    // Cargamos las sílabas cronometradas de las letras (JSON)
    if (Array.isArray(item.transcription) && item.transcription.length) {
      transcriptionSegments = item.transcription;
      karaokeLoadedLyrics = item.transcription;
    } else if (Array.isArray(item.lyrics) && item.lyrics.length) {
      transcriptionSegments = item.lyrics;
      karaokeLoadedLyrics = item.lyrics;
    } else {
      transcriptionSegments = [];
      karaokeLoadedLyrics = [];
    }

    cargarLetrasEnMonitor();

    const status = $("karaokeStatus");
    if (status) {
      status.textContent = `Estado: "${item.name}" cargada. ¡A cantar! 🎤`;
    }

    console.log("✅ Karaoke cargado desde Supabase con éxito", {
      id: item.id,
      name: item.name,
      trackSrc: track?.src,
      tapModeStyle: window.currentTapSyncModeType,
      datasetLoaded: track?.dataset?.karaokeLoaded
    });

  } catch (error) {
    console.error("Error cargando karaoke:", error);
    alert("❌ Error al cargar el karaoke.");
  }
}

function limpiarVariablesMonitor() {
  transcriptionSegments = [];
  baseTranscriptionSegments = [];
  textSegments = [];
  baseTextSegments = [];
  console.log("🧼 Variables del monitor de letras reseteadas");
}

// ==========================================
// COMPARTIR / IMPORTAR KARAOKES (.vocalApp)
// ==========================================
  
  
function blobToBase64Full(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // data:audio/...;base64,xxxx
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  const [meta, b64] = dataUrl.split(",");
  const mime = (meta.match(/data:(.*?);base64/) || [, "audio/mpeg"])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
  
async function exportKaraokeSong(id) {
  try {
    // Solicitamos el ítem limpio desde Supabase
    const item = await getLibraryItemByIdFromSupabase(id);
    if (!item) {
      alert("⚠️ No se encontró el karaoke");
      return;
    }

    // Buscamos los enlaces web públicos generados por tu Storage
    const audioUrlCloud = item.file_url || item.audioUrl || item.audioBlob;

    if (!audioUrlCloud) {
      alert("⚠️ Este karaoke no tiene un enlace de audio válido para exportar.");
      return;
    }

    // Creamos un paquete JSON compacto y moderno con las referencias de la nube
    const payload = {
      app: "vocalApp",
      version: 2, // Versión 2 adaptada a la nube
      exportedAt: new Date().toISOString(),
      name: item.name,
      type: item.type,
      metadata: item.metadata || {},
      transcription: item.transcription || [],
      lyrics: item.lyrics || [],
      // Exportamos el enlace directo de internet en vez de congelar la RAM con Base64 pesados
      file_url: audioUrlCloud, 
      file_path: item.file_path || null
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Generamos un nombre seguro para el archivo descargable (.json)
    const safeName = (item.name || "karaoke").replace(/[^a-zA-Z0-9-_]+/g, "_");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.vocalApp.json`; // Cambiado a .json para reflejar su naturaleza estructural
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    console.log("✅ Karaoke exportado con éxito:", safeName);
  } catch (err) {
    console.error("❌ Error exportando:", err);
    alert("❌ Error al exportar el karaoke");
  }
}

// ==========================================
// 3. IMPORTAR ARCHIVO A LA BIBLIOTECA
// ==========================================
async function importKaraokeFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validamos que el archivo pertenezca a nuestra aplicación
    if (!data || data.app !== "vocalApp") {
      alert("⚠️ Archivo no válido (No es un formato de VocalApp reconocido)");
      return;
    }

    // Estructuramos el nuevo registro que subiremos a Supabase
    const nuevoItemKaraoke = {
      name: data.name || "Karaoke importado",
      type: "karaoke",
      transcription: data.transcription || [],
      lyrics: data.lyrics || [],
      metadata: data.metadata || {},
      date: new Date().toISOString()
    };

    // --- MANEJO COMPATIBLE DE AUDIOS ---
    if (data.version === 2 && data.file_url) {
      // Si fue exportado con el nuevo sistema, heredamos el enlace de internet directo
      nuevoItemKaraoke.file_url = data.file_url;
      nuevoItemKaraoke.file_path = data.file_path;
    } else if (data.audio) {
      // Si es un archivo viejo de IndexedDB basado en Base64, convertimos el texto a binario
      const audioRecuperadoBlob = dataUrlToBlob(data.audio);
      
      // Enviamos el binario a tu función de subida para que se aloje en tu Storage de Supabase
      // Esto subirá el audio a internet y nos devolverá el link público automáticamente
      const { filePath, fileUrl } = await uploadFileToSupabase(
        audioRecuperadoBlob, 
        `${nuevoItemKaraoke.name}_importado.mp3`, 
        audioRecuperadoBlob.type
      );
      
      nuevoItemKaraoke.file_url = fileUrl;
      nuevoItemKaraoke.file_path = filePath;
    } else {
      alert("⚠️ El archivo de configuración no contiene rutas de audio válidas.");
      return;
    }

    // Insertamos la fila limpia en tu tabla remota
    if (!db) throw new Error("La base de datos no está inicializada.");
    const { error } = await db
      .from('library')
      .insert([nuevoItemKaraoke]);

    if (error) throw new Error(error.message);

    // Refrescamos los componentes de la interfaz de usuario
    await loadMyKaraokeSongs();
    await renderLibrary("todos");
    
    alert(`✅ "${nuevoItemKaraoke.name}" importado con éxito en la Biblioteca y en Karaoke → Mis Canciones`);
  } catch (err) {
    console.error("❌ Error importando archivo:", err);
    alert("❌ Archivo inválido, corrupto o error de subida a la nube.");
  }
}

// ==========================================
// 4. ACTUALIZACIÓN VISUAL DE DESPLEGABLES
// ==========================================
function actualizarSelectoresGlobales() {
  if (typeof loadVoiceOptionsInStudio === "function") loadVoiceOptionsInStudio();
  if (typeof loadTrackOptionsInStudio === "function") loadTrackOptionsInStudio();
  if (typeof loadTrackOptionsInKaraoke === "function") loadTrackOptionsInKaraoke();
  if (typeof loadTextOptionsInStudio === "function") loadTextOptionsInStudio();
  if (typeof loadPitchKaraokeOptions === "function") loadPitchKaraokeOptions();
  
  console.log("🔄 Selectores de la interfaz actualizados");
}


// ==========================================
// CAMBIAR TONO (PITCH SHIFTER - AudioWorklet)
// ==========================================
let pitchAudioContext = null;
let pitchAudioBuffer = null;
let pitchSelectedItem = null;
let pitchWorkletNode = null;
let pitchSourceNode = null;
let pitchGainNode = null;
let pitchIsPlaying = false;
let pitchIsPaused = false;
let pitchLastSavedId = null;

// Cache de promesas addModule por contexto (key: context, value: promise)
const _pitchWorkletLoaded = new WeakMap();

function _getWorkletUrl() {
  return window.__PITCH_WORKLET_URL__ || "/pitch-shifter-processor.js";
}

async function ensurePitchWorklet(ctx) {
  if (!ctx || !ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== "function") {
    throw new Error("AudioWorklet no está soportado en este navegador.");
  }

  let p = _pitchWorkletLoaded.get(ctx);
  if (p) return p;

  const url = _getWorkletUrl();

  p = (async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} cargando ${url}`);
    }

    const text = await res.text();
    if (/<!doctype html>|<html/i.test(text)) {
      throw new Error(`La URL del worklet devolvió HTML en vez de JS: ${url}`);
    }

    await ctx.audioWorklet.addModule(url);
  })().catch(err => {
    _pitchWorkletLoaded.delete(ctx);
    throw err;
  });

  _pitchWorkletLoaded.set(ctx, p);
  return p;
}

function getNetSemitones() {
  const up = parseInt(($("pitchUpSelect")?.value) || "0", 10);
  const down = parseInt(($("pitchDownSelect")?.value) || "0", 10);
  return up - down;
}

function getPitchRatio() {
  return Math.pow(2, getNetSemitones() / 12);
}

function onPitchSelectsChange() {
  const net = getNetSemitones();
  const display = $("pitchCurrentDisplay");
  if (display) {
    const signo = net > 0 ? "+" : "";
    display.textContent = `Cambio actual: ${signo}${net} semitono${Math.abs(net) === 1 ? "" : "s"}`;
  }

  if (pitchWorkletNode) {
    try {
      const pitchParam = pitchWorkletNode.parameters.get("pitchRatio");
      if (pitchParam) pitchParam.value = getPitchRatio();
    } catch (e) {}
  }
}

async function loadPitchKaraokeOptions() {
  const select = $("pitchKaraokeSelect");
  if (!select) return;
  select.innerHTML = `<option value="">Selecciona un archivo karaoke</option>`;
  try {
    // CORRECCIÓN 1: Conectado a la función correcta de la nube
    const items = await getLibraryItemsByTypeFromSupabase("karaoke");
    if (!items.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No hay archivos karaoke guardados";
      select.appendChild(opt);
      return;
    }
    items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.id; // Almacenamos el ID intacto (Número o UUID)
      opt.textContent = item.name;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Error cargando karaokes en Cambiar tono:", e);
  }
}

// ==========================================
// 2. SELECCIONAR Y DECODIFICAR AUDIO DE LA NUBE
// ==========================================
async function loadSelectedPitchKaraoke() {
  const select = $("pitchKaraokeSelect");
  const status = $("pitchLoadStatus");
  
  // CORRECCIÓN 2: Eliminado Number() para dar soporte nativo a UUIDs de texto
  const id = select?.value;
  if (!id) {
    alert("⚠️ Selecciona un archivo karaoke de la lista.");
    return;
  }
  try {
    if (status) status.textContent = "Estado: cargando y decodificando audio…";
    
    // Traemos los metadatos desde Supabase
    const item = await getLibraryItemByIdFromSupabase(id);
    const audioUrlCloud = item ? (item.file_url || item.audioUrl || item.audioBlob) : null;

    if (!item || !audioUrlCloud) {
      if (status) status.textContent = "Estado: el archivo no tiene un enlace de audio válido.";
      alert("⚠️ Este archivo karaoke no contiene audio en la nube.");
      return;
    }
    
    // Detener reproducción previa
    stopPitchShifted();

    if (!pitchAudioContext) {
      pitchAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // CORRECCIÓN 3: Al estar en la nube, descargamos temporalmente el audio binario en la RAM para decodificarlo
    const response = await fetch(audioUrlCloud);
    const cloudBlob = await response.blob();
    const arrayBuffer = await cloudBlob.arrayBuffer();
    
    pitchAudioBuffer = await pitchAudioContext.decodeAudioData(arrayBuffer.slice(0));
    pitchSelectedItem = item;

    // Reset del botón "Enviar al monitor karaoke"
    pitchLastSavedId = null;
    const sendBtn = $("pitchSendToKaraokeBtn");
    if (sendBtn) sendBtn.disabled = true;

    ensurePitchWorklet(pitchAudioContext).catch(() => { /* se reintenta al Play */ });

    if (status) {
      status.textContent = `Estado: "${item.name}" cargado (${pitchAudioBuffer.duration.toFixed(1)} s, ${pitchAudioBuffer.numberOfChannels} canal${pitchAudioBuffer.numberOfChannels === 1 ? "" : "es"}). Listo para reproducir.`;
    }
    const saveName = $("pitchSaveName");
    if (saveName && !saveName.value) {
      saveName.value = item.name + " (tono modificado)";
    }
  } catch (e) {
    console.error("Error cargando karaoke en pitch shifter:", e);
    if (status) status.textContent = "Estado: ❌ no se pudo decodificar el audio.";
    alert("❌ No se pudo decodificar el audio: " + e.message);
  }
}

// ==========================================
// 3. REPRODUCCIÓN MULTIMEDIA LOCAL (SIN CAMBIOS)
// ==========================================
async function playPitchShifted() {
  if (!pitchAudioBuffer) {
    alert("⚠️ Primero carga un archivo karaoke desde Biblioteca.");
    return;
  }
  if (!pitchAudioContext) {
    pitchAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (pitchAudioContext.state === "suspended") {
    await pitchAudioContext.resume();
  }
  if (pitchIsPaused && pitchWorkletNode && pitchSourceNode) {
    try {
      await pitchAudioContext.resume();
      pitchIsPaused = false;
      pitchIsPlaying = true;
      const st = $("pitchPlayStatus");
      if (st) st.textContent = "Estado: ▶️ reproduciendo con tono modificado…";
      return;
    } catch (e) {}
  }

  stopPitchShifted();

  try {
    await ensurePitchWorklet(pitchAudioContext);
  } catch (e) {
    console.error("Worklet no cargó:", e);
    alert("❌ No se pudo cargar el procesador de audio: " + e.message);
    return;
  }

  try {
    pitchSourceNode = pitchAudioContext.createBufferSource();
    pitchSourceNode.buffer = pitchAudioBuffer;

    pitchWorkletNode = new AudioWorkletNode(pitchAudioContext, "pitch-shifter-processor");

    const pitchParam = pitchWorkletNode.parameters.get("pitchRatio");
    if (pitchParam) pitchParam.value = getPitchRatio();

    pitchGainNode = pitchAudioContext.createGain();
    pitchGainNode.gain.value = 1.0;

    pitchSourceNode.connect(pitchWorkletNode);
    pitchWorkletNode.connect(pitchGainNode);
    pitchGainNode.connect(pitchAudioContext.destination);

    pitchSourceNode.onended = () => {
      if (pitchIsPlaying) stopPitchShifted();
    };

    pitchSourceNode.start();
    pitchIsPlaying = true;
    pitchIsPaused = false;

    const st = $("pitchPlayStatus");
    if (st) st.textContent = "Estado: ▶️ reproduciendo con tono modificado…";
  } catch (e) {
    console.error("Error iniciando reproducción con pitch shift:", e);
    alert("❌ Error iniciando el cambio de tono: " + e.message);
    stopPitchShifted();
  }
}

function pausePitchShifted() {
  if (!pitchAudioContext || !pitchIsPlaying) return;
  try {
    pitchAudioContext.suspend();
    pitchIsPaused = true;
    pitchIsPlaying = false;
    const st = $("pitchPlayStatus");
    if (st) st.textContent = "Estado: ⏸️ pausado.";
  } catch (e) {
    console.error("Error pausando:", e);
  }
}

function stopPitchShifted() {
  if (pitchSourceNode) {
    try { pitchSourceNode.onended = null; } catch (e) {}
    try { pitchSourceNode.stop(); } catch (e) {}
    try { pitchSourceNode.disconnect(); } catch (e) {}
    pitchSourceNode = null;
  }
  if (pitchWorkletNode) {
    try { pitchWorkletNode.disconnect(); } catch (e) {}
    pitchWorkletNode = null;
  }
  if (pitchGainNode) {
    try { pitchGainNode.disconnect(); } catch (e) {}
    pitchGainNode = null;
  }
  if (pitchAudioContext && pitchAudioContext.state === "suspended") {
    try { pitchAudioContext.resume(); } catch (e) {}
  }
  pitchIsPlaying = false;
  pitchIsPaused = false;
  const st = $("pitchPlayStatus");
  if (st) st.textContent = "Estado: ⏹️ detenido.";
}

function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const ab = new ArrayBuffer(bufferSize);
  const view = new DataView(ab);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

async function savePitchShiftedToLibrary() {
  if (!pitchAudioBuffer) {
    alert("⚠️ Primero carga un archivo karaoke desde Biblioteca.");
    return;
  }
  const semitones = getNetSemitones();
  if (semitones === 0) {
    if (!confirm("El cambio actual es 0 semitonos (sin modificación). ¿Guardar de todas formas?")) return;
  }

  const status = $("pitchSaveStatus");
  const btn = $("pitchSaveBtn");
  if (btn) btn.disabled = true;
  if (status) status.textContent = "Estado: 🔄 procesando audio con el nuevo tono…";

  try {
    stopPitchShifted();

    const renderedBuffer = await renderPitchShiftOffline(pitchAudioBuffer, semitones);
    const wavBlob = audioBufferToWavBlob(renderedBuffer);

    const nameInput = $("pitchSaveName");
    const signo = semitones > 0 ? "+" : "";
    const baseName = (pitchSelectedItem?.name || "Karaoke").replace(/\s*\(tono modificado\)\s*$/i, "");
    const finalName = (nameInput && nameInput.value.trim())
      ? nameInput.value.trim()
      : `${baseName} (${signo}${semitones} semitonos)`;

    // CORRECCIÓN 4: Reconstruido el cierre. Guardamos el nuevo binario procesado en Supabase (Storage + Fila)
    await saveLibraryItemToSupabase({
      name: finalName,
      type: "karaoke",
      blob: wavBlob, // Pasamos el nuevo WAV generado por el Shifter
      transcription: pitchSelectedItem?.transcription || [], // Heredamos las sílabas sincronizadas originales
      metadata: {
        ...(pitchSelectedItem?.metadata || {}),
        pitchShiftedSemitones: semitones,
        isModifiedTono: true
      }
    });

    if (status) status.textContent = "Estado: ¡Guardado en la nube con éxito! ✅";
    alert(`🎯 "${finalName}" guardado correctamente en tu biblioteca.`);

    // Actualizamos las listas en la interfaz
    await renderLibrary("todos");
    if (typeof loadMyKaraokeSongs === "function") await loadMyKaraokeSongs();
    await loadPitchKaraokeOptions();
  } catch (e) {
    console.error("Error guardando audio modificado:", e);
    if (status) status.textContent = "Estado: ❌ error al guardar.";
    alert("❌ Error al guardar las modificaciones en la base de datos: " + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Enviar el último guardado al monitor del karaoke (mismo flujo que Biblioteca)
async function sendPitchShiftedToKaraokeMonitor() {
  if (!pitchLastSavedId) {
    alert("⚠️ Primero guarda el archivo con tono cambiado para poder enviarlo al monitor.");
    return;
  }
  try {
    if (typeof loadKaraokeSong !== "function") {
      alert("⚠️ Función del monitor karaoke no disponible.");
      return;
    }
    stopPitchShifted();
    await loadKaraokeSong(pitchLastSavedId);
    const status = $("pitchSaveStatus");
    if (status) {
      status.textContent = "Estado: ✅ archivo cargado en el monitor karaoke. Cuando estés listo, ve a la pestaña Karaoke y presiona Iniciar grabación.";
    }
    alert("✅ Enviado al monitor karaoke.nnCuando estés listo, ve a la pestaña Karaoke y presiona '🎙️ Iniciar Grabación' para empezar a cantar.");
  } catch (e) {
    console.error("Error enviando al monitor karaoke desde Cambiar tono:", e);
    alert("❌ No se pudo enviar al monitor karaoke: " + e.message);
  }
}

// Render offline aplicando AudioWorklet (moderno, sin ScriptProcessorNode)
async function renderPitchShiftOffline(audioBuffer, semitones) {
  const ratio = Math.pow(2, semitones / 12);

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  await ensurePitchWorklet(offlineCtx);

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const worklet = new AudioWorkletNode(
    offlineCtx,
    "pitch-shifter-processor"
  );

  const pitchParam = worklet.parameters.get("pitchRatio");
  if (pitchParam) pitchParam.value = ratio;

  source.connect(worklet);
  worklet.connect(offlineCtx.destination);
  source.start();

  return await offlineCtx.startRendering();
}
