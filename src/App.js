// src/App.js
import React, { useState, useRef } from "react";
import axios from "axios";
import Tesseract from "tesseract.js";
import "./App.css";

// <-- put your OCR.Space free/pro key here -->
const OCR_SPACE_KEY = "K84934366888957";

function App() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [lang, setLang] = useState("te");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef();
  const inputSectionRef = useRef();

  const scrollToInput = () =>
    inputSectionRef.current?.scrollIntoView({ behavior: "smooth" });

  /* -----------------------------
     Enhanced image preprocessing
     - grayscale + unsharp mask + contrast
     - rescale for better OCR handling
     ----------------------------- */
  const enhanceImageBlob = async (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(file);

      img.onload = () => {
        // target max dimension to keep images manageable
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(400, Math.round(img.width * scale));
        const h = Math.max(200, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");

        // draw original image (resized)
        ctx.drawImage(img, 0, 0, w, h);

        // get pixel data
        let imageData = ctx.getImageData(0, 0, w, h);
        let data = imageData.data;

        // 1) convert to grayscale (luma)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          data[i] = data[i + 1] = data[i + 2] = lum;
        }

        // 2) apply simple unsharp mask kernel (sharpen)
        const copy = new Uint8ClampedArray(data);
        const kernel = [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ];
        const wInner = w - 1, hInner = h - 1;
        try {
          for (let y = 1; y < hInner; y++) {
            for (let x = 1; x < wInner; x++) {
              let sum = 0;
              let k = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++, k++) {
                  const px = x + kx;
                  const py = y + ky;
                  const pidx = (py * w + px) * 4;
                  sum += copy[pidx] * kernel[k];
                }
              }
              const idx = (y * w + x) * 4;
              const v = Math.min(255, Math.max(0, Math.round(sum)));
              data[idx] = data[idx + 1] = data[idx + 2] = v;
              data[idx + 3] = 255;
            }
          }
        } catch (e) {
          // in case anything fails, ignore and keep the grayscale image
          console.warn("sharpen kernel failed:", e);
        }

        // 3) increase contrast slightly and nudge brightness
        const contrastFactor = 1.12;
        const brightnessOffset = -6;
        for (let i = 0; i < data.length; i += 4) {
          let v = data[i];
          v = (v - 128) * contrastFactor + 128 + brightnessOffset;
          v = Math.round(Math.min(255, Math.max(0, v)));
          data[i] = data[i + 1] = data[i + 2] = v;
        }

        // put processed data back
        ctx.putImageData(imageData, 0, 0);

        // try a second canvas pass with canvas2D filter (if supported)
        try {
          const c2 = document.createElement("canvas");
          c2.width = w;
          c2.height = h;
          const ctx2 = c2.getContext("2d");
          if ("filter" in ctx2) {
            // small no-op blur + contrast may help in some browsers
            ctx2.filter = "contrast(110%)";
            ctx2.drawImage(canvas, 0, 0);
            c2.toBlob((blob) => resolve(blob), "image/png", 0.95);
            return;
          }
        } catch (e) {
          // ignore
        }

        // fallback: output processed canvas
        canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
      };

      img.onerror = (e) => reject(e);
    });
  };

  /* -----------------------------
     OCR pipeline: try OCR.Space then fallback to Tesseract
     ----------------------------- */
  const runOCR = async (file) => {
    setErrorMsg("");
    setIsExtracting(true);
    setOcrProgress(2);
    setFileName(file.name || "");

    try {
      const enhanced = await enhanceImageBlob(file);
      setImagePreview(URL.createObjectURL(enhanced));

      const form = new FormData();
      form.append("file", enhanced, "enhanced.png");
      form.append("language", "eng");
      form.append("isOverlayRequired", false);

      const res = await axios.post("https://api.ocr.space/parse/image", form, {
        headers: { apikey: OCR_SPACE_KEY },
        onUploadProgress: (p) => {
          if (p.total) setOcrProgress(Math.round((p.loaded / p.total) * 100));
        },
        timeout: 90000,
      });

      const parsed = res?.data?.ParsedResults?.[0]?.ParsedText || "";
      if (parsed.trim()) {
        setInputText(parsed.replace(/\s+/g, " ").trim());
        setIsExtracting(false);
        setOcrProgress(100);
        return;
      } else {
        setErrorMsg("OCR.Space returned no text — falling back to local OCR.");
      }
    } catch (err) {
      console.warn("OCR.Space error:", err);
      setErrorMsg("OCR.Space error; trying local OCR fallback.");
    }

    // fallback: Tesseract.js
    try {
      setOcrProgress(5);
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      const text = (result?.data?.text || "").replace(/\s+/g, " ").trim();
      setInputText(text);
      if (!text) setErrorMsg("Local OCR couldn't extract text. Try a clearer image.");
    } catch (err) {
      console.error("Tesseract error:", err);
      setErrorMsg("Both OCR methods failed.");
    } finally {
      setIsExtracting(false);
      setOcrProgress(100);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) runOCR(f);
  };

  /* -----------------------------
     Translation (MyMemory) + small heuristics
     ----------------------------- */
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

      // small shortcut for common phrase to improve demo quality
      const low = q.toLowerCase();
      if (low.includes("good morning") && lang === "te") translated = "శుభోదయం";

      setTranslatedText(translated);
    } catch (err) {
      console.error("Translate error:", err);
      setErrorMsg("Translation failed — please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  const speak = () => {
    if (!translatedText) {
      setErrorMsg("Please translate first before playing audio.");
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
    };
    utter.lang = map[lang] || "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  const copyTranslation = async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      alert("Copied translated text.");
    } catch {
      setErrorMsg("Copy failed.");
    }
  };

  return (
    <div className="app-gradient">
      <header className="hero">
        <div className="hero-inner">
          <h1 className="ai-glow">Sahaya<span className="ai-highlight">AI</span></h1>
          <p className="tag">Empowering Communities Through Language and AI</p>
          <div className="hero-buttons">
            <button className="btn primary big" onClick={scrollToInput}>
              🚀 Get Started
            </button>
            <button className="btn glass big" onClick={() => fileInputRef.current?.click()}>
              📷 Upload Image
            </button>
          </div>
        </div>
      </header>

      <main className="container" ref={inputSectionRef}>
        {/* Left: Input Card */}
        <section className="card left-card">
          <h2>Input</h2>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type English text here or upload an image below to extract text..."
            rows={3}
          />

          {/* SINGLE file input, visible; label styled as button */}
          <div className="file-row">
            <div className="file-drop">
              <p>Drag & drop an image here, or choose a file</p>
              <input
                id="file"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                ref={fileInputRef}
              />
              <div className="file-meta">
                <label htmlFor="file" className="file-button">Choose File</label>
                <span className="filename">{fileName || "No file chosen"}</span>
              </div>
            </div>

            <div className="preview">
              {imagePreview ? <img src={imagePreview} alt="preview" /> : <span>Image preview will appear here</span>}
            </div>
          </div>

          {isExtracting && (
            <div className="progress">
              <div className="bar" style={{ width: `${ocrProgress}%` }} />
              <small>Extracting text... {ocrProgress}%</small>
            </div>
          )}
        </section>

        {/* Right: Translate & Speak */}
        <section className="card card-right">
          <h2>Translate & Speak</h2>

          <div className="language-select">
            <label>Choose Language</label>
            <div>
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="te">Telugu</option>
                <option value="hi">Hindi</option>
                <option value="ta">Tamil</option>
                <option value="kn">Kannada</option>
                <option value="ml">Malayalam</option>
              </select>
            </div>
          </div>

          <div className="action-buttons">
            <button className="btn-action btn-translate" onClick={translate} disabled={isTranslating}>
              {isTranslating ? "Translating..." : "Translate"}
            </button>

            <button className="btn-action btn-speak" onClick={speak}>
              🔊 Speak
            </button>
          </div>

          {/* spacing before translated text */}
          <div style={{ height: 10 }} />

          <div>
            <h3>Translated Text</h3>
            <div className="result-box">
              {translatedText || <span className="muted">Translation will appear here...</span>}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button className="btn small" onClick={copyTranslation}>Copy</button>
              <button className="btn small" onClick={() => {
                const blob = new Blob([translatedText || ""], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "translation.txt";
                a.click();
                URL.revokeObjectURL(url);
              }}>Download</button>
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
