// === HTML elementlar ===
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const MODEL_URL = './models';

// === 1. Modellarni yuklash ===
async function loadModels() {
  console.log("🧠 Modellar yuklanmoqda...");
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]);
  console.log("✅ Barcha modelllar yuklandi!");
  startVideo();
}

// === 2. Kamerani ishga tushirish ===
async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      recognizeFaces();
    };
  } catch (err) {
    console.error("❌ Kameraga kirishda xato:", err);
  }
}

// === 3. /images papkasidagi rasm fayllarni yuklash ===
async function loadLabeledImages() {
  console.log("🖼️ Rasmlar yuklanmoqda...");

  const response = await fetch('./people.json');
  const imageFiles = await response.json();

  const labeledDescriptors = [];

  for (const fileName of imageFiles) {
    const label = fileName.replace(/\.[^/.]+$/, "").trim();
    const imgUrl = `./images/${encodeURIComponent(fileName)}`;

    try {
      const img = await faceapi.fetchImage(imgUrl);
      const detections = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detections) {
        console.warn(`⚠️ ${fileName}: yuz aniqlanmadi.`);
        continue;
      }

      console.log(`✅ ${label} uchun yuz ma'lumoti saqlandi`);
      labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(label, [detections.descriptor]));
    } catch (err) {
      console.error(`❌ ${imgUrl} yuklanmadi:`, err);
    }
  }

  return labeledDescriptors;
}

// === 4. Yuzni aniqlash va nom yozish (Tuzatilgan Rejim) ===
async function recognizeFaces() {
  const labeledDescriptors = await loadLabeledImages();

  if (!labeledDescriptors || labeledDescriptors.length === 0) {
    console.error("❌ Yuz aniqlanmadi.");
    return;
  }

  // FaceMatcher chegarasi optimallashtirildi
  const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);

  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  canvas.width = displaySize.width;
  canvas.height = displaySize.height;
  faceapi.matchDimensions(canvas, displaySize);

  const context = canvas.getContext('2d');

  setInterval(async () => {
    // 1. Yuzlarni aniqlash
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.7 })) // ishonchlilik 0.7
      .withFaceLandmarks()
      .withFaceDescriptors();
      
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    context.clearRect(0, 0, canvas.width, canvas.height); // Avvalgi ramkalarni tozalash

    // 2. >>> YUZGA ASOSLANGAN REJIMNI TEKSHIRISH <<<
    if (resizedDetections.length === 0) {
        // Yuz aniqlanmadi (Harakatsiz rejim)
        console.log("😴 Yuz aniqlanmadi. Tizim Kutish Rejimida.");

        // Kutish rejimini ekranda ko'rsatish
        context.save();
        context.scale(-1, 1);
        context.translate(-canvas.width, 0);
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.fillText('Harakat yoq (Yuz aniqlanmadi)', canvas.width / 2 - 140, canvas.height / 2);
        context.restore();
        
        return; 
    }

    // 3. Yuz aniqlandi (Faol rejim: Yonsin)
    console.log(`🏃 ${resizedDetections.length} ta yuz aniqlandi. Tizim faol.`);

    // Canvasni teskari qilish (ko‘zgudek)
    context.save();
    context.scale(-1, 1);
    context.translate(-canvas.width, 0);

    // Yuzlarni taniish va ramka chizish
    for (let i = 0; i < resizedDetections.length; i++) {
      const detection = resizedDetections[i];
      const box = detection.detection.box;
      const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
      
      const label = bestMatch.label;
      const distance = bestMatch.distance;
      
      const name = label === 'unknown' 
        ? 'Noma’lum yuz' 
        : `${label.split('_').join(' ')} (${distance.toFixed(2)})`;

      const drawBox = new faceapi.draw.DrawBox(box, {
        label: name,
        boxColor: label === 'unknown' ? 'red' : 'lime',
        lineWidth: 2
      });
      
      drawBox.draw(canvas);
    }

    context.restore(); // Teskari o'girishni bekor qilish
  }, 200);
}

// === 5. Dastur ishga tushirish ===
loadModels();

//192.168.100.89