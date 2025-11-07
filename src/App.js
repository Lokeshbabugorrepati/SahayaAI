// src/App.js
import React, { useState, useRef } from "react";
import axios from "axios";
import Tesseract from "tesseract.js";
import "./App.css";

const OCR_SPACE_KEY = "K84934366888957"; // ← your OCR.Space API key

function App() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [lang, setLang] = useState("te"); // default Telugu
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef();

  // ----- Image preprocessing (canvas) -----
  const enhanceImageBlob = async (file) => {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = 2000; // avoid extremely large canvases
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");

        // Apply filters and draw
        ctx.filter = "contrast(180%) brightness(120%) saturate(110%)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // convert to grayscale to help OCR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const avg = 0.299 * r + 0.587 * g + 0.114 * b;
          // increase contrast for darker pixels a bit
          data[i] = data[i + 1] = data[i + 2] = avg;
        }
        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        }, "image/png", 0.95);
      };
      img.onerror = (e) => reject(e);
    });
  };

  // ----- OCR via OCR.Space with fallback to Tesseract.js -----
  const runOCR = async (file) => {
    setErrorMsg("");
    setIsExtracting(true);
    setOcrProgress(1);

    try {
      // enhance
      const enhancedBlob = await enhanceImageBlob(file);
      setImagePreview(URL.createObjectURL(enhancedBlob));

      // form data to OCR.Space
      const form = new FormData();
      form.append("file", enhancedBlob, "enhanced.png");
      form.append("language", "eng");
      form.append("isOverlayRequired", false);

      const res = await axios.post("https://api.ocr.space/parse/image", form, {
        headers: { apikey: OCR_SPACE_KEY },
        onUploadProgress: (p) => {
          if (p.total) setOcrProgress(Math.round((p.loaded / p.total) * 100));
        },
        timeout: 120000,
      });

      const parsed =
        res?.data?.ParsedResults && res.data.ParsedResults[0]
          ? res.data.ParsedResults[0].ParsedText
          : "";

      if (parsed && parsed.trim().length > 0) {
        setInputText(parsed.replace(/\s+/g, " ").trim());
        setIsExtracting(false);
        setOcrProgress(100);
        return;
      } else {
        // fallback
        setErrorMsg("OCR.Space returned empty result — using local OCR fallback.");
      }
    } catch (err) {
      // network or API error, fallback
      console.warn("OCR.Space error:", err);
      setErrorMsg("OCR.Space error — using local OCR fallback.");
    }

    // ----- Local fallback using Tesseract -----
    try {
      setOcrProgress(5);
      const workerResult = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      const text = (workerResult?.data?.text || "").replace(/\s+/g, " ").trim();
      setInputText(text);
      if (!text) setErrorMsg("Local OCR could not extract text. Try a clearer image.");
    } catch (err) {
      console.error("Tesseract error:", err);
      setErrorMsg("Both OCR.Space and local OCR failed.");
    } finally {
      setIsExtracting(false);
      setOcrProgress(100);
    }
  };

  // ----- Drag & Drop -----
  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) runOCR(f);
  };
  const handleDragOver = (e) => e.preventDefault();

  // ----- File input -----
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) runOCR(f);
  };

  // ----- Translate (MyMemory free API) -----
  const translate = async () => {
    setErrorMsg("");
    const q = inputText.trim();
    if (!q) {
      setErrorMsg("Please enter or extract text first.");
      return;
    }
    setIsTranslating(true);
    setTranslatedText("");
    try {
      const res = await axios.get("https://api.mymemory.translated.net/get", {
        params: { q, langpair: `en|${lang}` },
        timeout: 30000,
      });
      let translated = res?.data?.responseData?.translatedText || "";
      // some smart short mapping for common phrases (improve accuracy)
      const low = q.toLowerCase();
      if (low.includes("good morning")) translated = lang === "te" ? "శుభోదయం" : translated;
      if (low.includes("thank you")) translated = lang === "te" ? "ధన్యవాదాలు" : translated;

      setTranslatedText(translated);
    } catch (err) {
      console.error("Translation error:", err);
      setErrorMsg("Translation failed. Check connection or try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  // ----- Speech -----
  const speak = () => {
    if (!translatedText) {
      setErrorMsg("Please translate text first.");
      return;
    }
    const utter = new SpeechSynthesisUtterance(translatedText);
    const map = {
      te: "te-IN",
      hi: "hi-IN",
      ta: "ta-IN",
      kn: "kn-IN",
      ml: "ml-IN",
      bn: "bn-IN",
      mr: "mr-IN",
      gu: "gu-IN",
      pa: "pa-IN",
      en: "en-IN",
    };
    utter.lang = map[lang] || "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  // ----- Utility: copy/download -----
  const copyTranslation = async () => {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText);
    alert("Copied translated text to clipboard.");
  };
  const downloadTranslation = () => {
    if (!translatedText) return;
    const blob = new Blob([translatedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sahayaai-translation.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-gradient">
      <header className="hero">
        <div className="hero-inner">
          <div className="logo-row">
            <img
              src="https://raw.githubusercontent.com/Lokeshbabugorrepati/SahayaAI/main/assets/logo-small.png"
              alt="SahayaAI"
              className="logo"
              onError={(e)=>{e.target.style.display='none';}}
            />
            <h1>SahayaAI</h1>
          </div>
          <p className="tag">Empowering Communities Through Language and AI</p>
        </div>
      </header>

      <main className="container">
        <section
          className="card upload-card"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <h2>Input</h2>

          <div className="uploader">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type English text here or upload an image below to extract text..."
              rows={6}
            />

            <div className="file-row">
              <div className="file-drop">
                <p>Drag & drop an image here, or</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
                <button
                  className="btn"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  Choose Image
                </button>
              </div>

              <div className="preview">
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" />
                ) : (
                  <div className="preview-empty">Image preview will appear here</div>
                )}
              </div>
            </div>

            {isExtracting && (
              <div className="progress">
                <div className="bar" style={{ width: `${ocrProgress}%` }} />
                <small>Extracting text... {ocrProgress}%</small>
              </div>
            )}
          </div>
        </section>

        <section className="card output-card">
          <h2>Translate & Speak</h2>

          <div className="controls">
            <label>Choose Language</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
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

            <div className="action-row">
              <button className="btn primary" onClick={translate} disabled={isTranslating}>
                {isTranslating ? "Translating..." : "Translate"}
              </button>
              <button className="btn" onClick={speak}>
                🔊 Speak
              </button>
            </div>
          </div>

          <div className="result">
            <h3>Translated Text</h3>
            <div className="result-box">
              {translatedText || <span className="muted">Translation will appear here...</span>}
            </div>

            <div className="result-actions">
              <button className="btn" onClick={copyTranslation}>Copy</button>
              <button className="btn" onClick={downloadTranslation}>Download</button>
            </div>
          </div>

          {errorMsg && <div className="error">{errorMsg}</div>}
        </section>
      </main>

      <footer className="footer">
        <small>Developed by Lokesh Babu Gorrepati • SahayaAI</small>
      </footer>
    </div>
  );
}

export default App;
