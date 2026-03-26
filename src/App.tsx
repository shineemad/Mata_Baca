import { useRef, useState, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
// 1. IMPOR GEMINI SDK
import { GoogleGenerativeAI } from "@google/generative-ai";

// 2. KONFIGURASI GEMINI (Ganti dengan API KEY milikmu)
// PENTING: Untuk portfolio asli, gunakan file .env agar API Key tidak bocor di GitHub.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? "";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    maxOutputTokens: 80,
    temperature: 0.2,
  },
});

const AUTOSCAN_INTERVAL_MS = 25000;
const IMAGE_SIGNATURE_SLICE = 120;
const VIDEO_CONSTRAINTS = {
  width: 640,
  height: 360,
  facingMode: "environment",
} as const;

const PROMPT_RINGKAS =
  "Anda asisten tunanetra. Jika teks jelas, bacakan apa adanya. Jika buram/terpotong, katakan: 'Gambar buram, coba jauhkan sedikit HP Anda dan pastikan cahaya terang.' Jika tidak ada teks, katakan: 'Tidak terdeteksi tulisan di depan kamera.' Jika label obat/makanan/tagihan, sebut bagian terpenting dulu. Balas teks polos, singkat, maksimal 2 kalimat.";

export default function App() {
  const webcamRef = useRef<Webcam>(null);
  const lastImageSignatureRef = useRef<string>("");

  // State App
  const [hasilTeks, setHasilTeks] = useState<string>("");
  const [sedangMemproses, setSedangMemproses] = useState<boolean>(false);
  const [modeOtomatis, setModeOtomatis] = useState<boolean>(false); // Solusi 1 & 2

  // --- LOGIKA SUARA (Updated untuk Pengalaman Lebih Humanis) ---
  const berbicara = useCallback((teks: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const ucapan = new SpeechSynthesisUtterance(teks);
      ucapan.lang = "id-ID";
      ucapan.rate = 1.0; // Kecepatan normal agar tidak membosankan
      window.speechSynthesis.speak(ucapan);
    }
  }, []);

  // --- LOGIKA UTAMA GEMINI AI (Solusi 2) ---
  const analisisGambarDenganAI = useCallback(
    async (base64Image: string) => {
      const imageData = base64Image.split(",")[1] ?? "";
      const imageSignature = `${imageData.length}:${imageData.slice(0, IMAGE_SIGNATURE_SLICE)}:${imageData.slice(-IMAGE_SIGNATURE_SLICE)}`;

      // Hindari request berulang untuk frame yang sangat mirip.
      if (imageSignature === lastImageSignatureRef.current) {
        return;
      }

      lastImageSignatureRef.current = imageSignature;

      try {
        setSedangMemproses(true);
        setHasilTeks("Sedang berpikir...");

        // B. Siapkan Data Gambar untuk dikirim
        const formatGemini = {
          inlineData: {
            data: imageData, // Hapus header "data:image/jpeg;base64,"
            mimeType: "image/jpeg",
          },
        };

        console.log("🧠 Gemini sedang menganalisis gambar...");

        // D. Kirim ke AI
        const result = await model.generateContent([
          PROMPT_RINGKAS,
          formatGemini,
        ]);
        const response = await result.response;
        const teksFinal = response.text();

        console.log("✅ Gemini Menjawab:", teksFinal);

        // E. Simpan & Bacakan
        setHasilTeks(teksFinal);
        berbicara(teksFinal);
      } catch (error) {
        console.error("❌ Gemini API Error:", error);
        const pesanError =
          "Maaf, Asisten Jenius sedang sibuk. Mohon coba lagi nanti.";
        setHasilTeks(pesanError);
        berbicara(pesanError);
      } finally {
        setSedangMemproses(false);
      }
    },
    [berbicara],
  );

  // Fungsi Jepret Manual (Kita pertahankan untuk backup)
  const jepretManual = useCallback(() => {
    const gambarBawaan = webcamRef.current?.getScreenshot();
    if (gambarBawaan) {
      analisisGambarDenganAI(gambarBawaan);
    }
  }, [webcamRef, analisisGambarDenganAI]);

  // --- LOGIKA AUTO-CAPTURE (Solusi 1) ---
  useEffect(() => {
    // Jika mode otomatis mati, jangan lakukan apa-apa
    if (!modeOtomatis) return;

    // Saat aplikasi dibuka: Sambutan
    if (hasilTeks === "") {
      berbicara(
        "Mata Baca diaktifkan. Mode pindaian otomatis menyala. Hadapkan kamera ke teks, dan saya akan membacakannya otomatis.",
      );
    }

    // Buat loop: Jepret setiap 5 detik
    const timer = setInterval(() => {
      // Jangan jepret kalau sedang proses sebelumnya
      if (webcamRef.current && !sedangMemproses) {
        const gambarAutoscan = webcamRef.current.getScreenshot();
        if (gambarAutoscan) {
          console.log("📸 [Autoscan] Menjepret otomatis...");
          // UX: Beri bunyi 'klik' kecil agar user tahu app bekerja
          const audioklik = new Audio(
            "https://www.soundjay.com/camera/camera-shutter-click-01.mp3",
          );
          audioklik.volume = 0.2;
          audioklik.play();

          analisisGambarDenganAI(gambarAutoscan);
        }
      }
    }, AUTOSCAN_INTERVAL_MS); // 25 detik agar biaya token lebih rendah

    // Cleanup function: Matikan timer saat komponen diclose/mode dimatikan
    return () => clearInterval(timer);
  }, [
    modeOtomatis,
    sedangMemproses,
    analisisGambarDenganAI,
    berbicara,
    hasilTeks,
  ]);

  return (
    <div className="h-screen w-screen bg-gray-950 flex flex-col overflow-hidden relative font-sans">
      {/* BAGIAN ATAS: Kamera (Resolusi HD dipaksa) */}
      <div className="h-1/2 w-full bg-black relative">
        <Webcam
          audio={false}
          ref={webcamRef}
          videoConstraints={VIDEO_CONSTRAINTS}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.35}
          className="w-full h-full object-cover"
        />
        {/* Indikator Mode di layar */}
        <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${modeOtomatis ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
          />
          <span className="text-white font-medium">
            MODE AUTO: {modeOtomatis ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      {/* BAGIAN TENGAH: Area Hasil Teks (Vibe Coder Styling) */}
      <div className="h-1/4 w-full bg-gray-900 p-6 overflow-y-auto border-t border-gray-800 flex items-center justify-center">
        <p
          className={`text-white text-center font-medium leading-relaxed ${sedangMemproses ? "text-gray-500 italic" : "text-2xl"}`}
        >
          {hasilTeks || "Menunggu pindaian otomatis..."}
        </p>
      </div>

      {/* BAGIAN BAWAH: Tombol Raksasa UX untuk Tunanetra */}
      <button
        onClick={() => setModeOtomatis(!modeOtomatis)}
        className={`h-1/4 w-full flex flex-col items-center justify-center transition-colors shadow-inner
          ${modeOtomatis ? "bg-red-700 active:bg-red-800" : "bg-green-600 active:bg-green-700"}`}
      >
        <span className="text-white text-4xl font-extrabold tracking-tight">
          {modeOtomatis ? "🛑 MATIKAN" : "🟢 AKTIFKAN"}
        </span>
        <span className="text-white/80 mt-2 text-xl font-light">
          Mode Pindaian Otomatis
        </span>
      </button>

      {/* UX Hint untuk debugger (kita) */}
      {!modeOtomatis && (
        <button
          onClick={jepretManual}
          className="absolute bottom-4 right-4 bg-white/20 p-2 rounded text-xs text-white"
        >
          Debug Jepret
        </button>
      )}
    </div>
  );
}
