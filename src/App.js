import React, { useState } from "react";
import axios from "axios";

function App() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [targetLang, setTargetLang] = useState("te");
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  // 📸 Smart Image Enhancement + OCR.Space Integration
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsExtracting(true);
    setOcrProgress(0);
    setInputText("");

    try {
      // 🧠 Step 1: Enhance Image Before OCR
      const img = new Image();
      img.src = URL.createObjectURL(file);

      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;

      // Enhance contrast and brightness
      ctx.filter = "contrast(200%) brightness(130%)";
      ctx.drawImage(img, 0, 0);

      // Convert to grayscale
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = data[i + 1] = data[i + 2] = avg;
      }
      ctx.putImageData(imageData, 0, 0);

      // Convert enhanced image to Blob
      const enhancedBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );

      // 🛰 Step 2: Send Enhanced Image to OCR.Space API
      const formData = new FormData();
      formData.append("file", enhancedBlob, "enhanced.png");
      formData.append("language", "eng");
      formData.append("isOverlayRequired", false);

      const res = await axios.post("https://api.ocr.space/parse/image", formData, {
        headers: {
          apikey: "K84934366888957", // ✅ Your OCR.Space API key
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (p) =>
          setOcrProgress(Math.round((p.loaded / p.total) * 100)),
      });

      const parsed = res.data.ParsedResults?.[0]?.ParsedText || "";
      const cleanText = parsed.replace(/\s+/g, " ").trim();

      if (cleanText) {
        setInputText(cleanText);
      } else {
        alert("No readable text found. Try a clearer photo.");
      }
    } catch (err) {
      console.error("OCR Error:", err);
      alert("OCR processing failed. Please retry.");
    }

    setIsExtracting(false);
  };

  // 🌐 Translate using MyMemory API
  const translateText = async () => {
    if (!inputText.trim()) {
      alert("Please enter or extract text first!");
      return;
    }

    setIsTranslating(true);

    try {
      const res = await axios.get("https://api.mymemory.translated.net/get", {
        params: { q: inputText, langpair: `en|${targetLang}` },
      });

      let translated = res.data.responseData.translatedText;

      // 🧠 Smart Context Corrections
      const corrections = [
        { en: "good morning", te: "శుభోదయం" },
        { en: "good night", te: "శుభరాత్రి" },
        { en: "thank you", te: "ధన్యవాదాలు" },
        { en: "government", te: "ప్రభుత్వం" },
        { en: "health scheme", te: "ఆరోగ్య పథకం" },
        { en: "application form", te: "దరఖాస్తు ఫారమ్" },
      ];
      const lower = inputText.toLowerCase();
      corrections.forEach((pair) => {
        if (lower.includes(pair.en)) translated = pair[targetLang] || translated;
      });

      setTranslatedText(translated);
    } catch (err) {
      console.error("Translation Error:", err);
      alert("Translation failed. Please check your connection.");
    }

    setIsTranslating(false);
  };

  // 🔊 Text-to-Speech
  const speakText = () => {
    if (!translatedText) return alert("Translate something first!");
    const utter = new SpeechSynthesisUtterance(translatedText);
    const langMap = {
      te: "te-IN",
      hi: "hi-IN",
      ta: "ta-IN",
      kn: "kn-IN",
      ml: "ml-IN",
      bn: "bn-IN",
      mr: "mr-IN",
      gu: "gu-IN",
      pa: "pa-IN",
    };
    utter.lang = langMap[targetLang] || "en-IN";
    window.speechSynthesis.speak(utter);
  };

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "Poppins, sans-serif",
        textAlign: "center",
        background: "#f8f9fa",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ color: "#007bff" }}>🌐 SahayaAI</h1>
      <h3>Accurate OCR + Translation + Voice Assistant</h3>

      <textarea
        rows="5"
        cols="60"
        placeholder="Enter English text or upload an image..."
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        style={{
          marginTop: "20px",
          padding: "10px",
          fontSize: "16px",
          borderRadius: "8px",
          border: "1px solid gray",
          resize: "none",
          width: "80%",
          maxWidth: "600px",
        }}
      />

      <div style={{ marginTop: "15px" }}>
        <input type="file" accept="image/*" onChange={handleImageUpload} />
      </div>

      {isExtracting && (
        <p style={{ color: "#ff6600", marginTop: "10px" }}>
          Extracting text... {ocrProgress}% ⏳
        </p>
      )}

      <div style={{ marginTop: "15px" }}>
        <label>Choose Language: </label>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          style={{
            padding: "8px",
            borderRadius: "5px",
            margin: "10px",
            fontSize: "16px",
          }}
        >
          <option value="te">Telugu</option>
          <option value="hi">Hindi</option>
          <option value="ta">Tamil</option>
          <option value="kn">Kannada</option>
          <option value="ml">Malayalam</option>
          <option value="bn">Bengali</option>
          <option value="mr">Marathi</option>
          <option value="gu">Gujarati</option>
          <option value="pa">Punjabi</option>
        </select>
      </div>

      <div>
        <button
          onClick={translateText}
          disabled={isTranslating}
          style={{
            marginTop: "15px",
            padding: "10px 20px",
            fontSize: "16px",
            background: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "8px",
          }}
        >
          {isTranslating ? "Translating..." : "Translate"}
        </button>

        <button
          onClick={speakText}
          style={{
            marginLeft: "15px",
            padding: "10px 20px",
            fontSize: "16px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "8px",
          }}
        >
          🔊 Speak
        </button>
      </div>

      <div style={{ marginTop: "30px" }}>
        <h3>📝 Translated Text:</h3>
        <div
          style={{
            background: "white",
            padding: "15px",
            borderRadius: "8px",
            fontSize: "18px",
            width: "80%",
            margin: "auto",
            boxShadow: "0 0 10px rgba(0,0,0,0.1)",
          }}
        >
          {translatedText || "Translation will appear here..."}
        </div>
      </div>
    </div>
  );
}

export default App;
