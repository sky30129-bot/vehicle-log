import { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "vehicle_log_records";
const API_KEY = "여기에_Anthropic_API키_입력";
const views = { HOME: "home", CAMERA: "camera", FORM: "form", LIST: "list", SEND: "send" };

async function analyzeImage(base64Image) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
            { type: "text", text: "이 이미지는 자동차 계기판입니다. 주행거리(오도미터/ODO) 숫자만 정확히 읽어서 숫자만 답하세요. 단위(km 등)는 제외하고 숫자만. 예: 12345. 읽을 수 없으면 '인식불가'라고만 답하세요." }
          ]
        }]
      })
    });
    const data = await res.json();
    const raw = data?.content?.[0]?.text?.trim() || "";
    if (raw.includes("인식불가") || raw.includes("없")) return "";
    return raw.replace(/[^0-9]/g, "");
  } catch { return ""; }
}

export default function App() {
  const [view, setView] = useState(views.HOME);
  const [records, setRecords] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  });
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), client: "", odometer: "", memo: "" });
  const [capturedImage, setCapturedImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [toast, setToast] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }, [records]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); } }, [toast]);

  const showToast = (msg) => setToast(msg);

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const startCamera = async () => {
    setView(views.CAMERA);
    setCapturedImage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { showToast("카메라 접근 실패"); setView(views.HOME); }
  };

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    canvasRef.current.width = v.videoWidth;
    canvasRef.current.height = v.videoHeight;
    canvasRef.current.getContext("2d").drawImage(v, 0, 0);
    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.9);
    setCapturedImage(dataUrl);
    stopCamera();
    setForm(f => ({ ...f, date: new Date().toISOString().slice(0,10), client: "", odometer: "", memo: "" }));
    setView(views.FORM);
    setAnalyzing(true);
    const odo = await analyzeImage(dataUrl.split(",")[1]);
    setForm(f => ({ ...f, odometer: odo }));
    setAnalyzing(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setCapturedImage(dataUrl);
      setForm({ date: new Date().toISOString().slice(0,10), client: "", odometer: "", memo: "" });
      setView(views.FORM);
      setAnalyzing(true);
      const odo = await analyzeImage(dataUrl.split(",")[1]);
      setForm(f => ({ ...f, odometer: odo }));
      setAnalyzing(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const saveRecord = () => {
    if (!form.client.trim()) { showToast("거래처명을 입력하세요"); return; }
    if (!form.odometer) { showToast("주행거리를 입력하세요"); return; }
    setRecords(r => [{ id: Date.now(), ...form }, ...r]);
    setForm({ date: new Date().toISOString().slice(0,10), client: "", odometer: "", memo: "" });
    setCapturedImage(null);
    showToast("저장되었습니다 ✓");
    setView(views.LIST);
  };

  const deleteRecord = (id) => { setRecords(r => r.filter(x => x.id !== id)); showToast("삭제되었습니다"); };

  const handleExport = () => {
    if (!email.includes("@")) { showToast("이메일을 확인하세요"); return; }
    setSending(true);
    const bom = "\uFEFF";
    const csv = ["날짜,거래처명,주행거리(km),메모", ...records.map(r => `${r.date},${r.client},${r.odometer},${r.memo || ""}`)].join("\n");
    const blob = new Blob([bom + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `운행일지_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setSending(false); setSent(true); showToast("CSV 다운로드 완료");
    setTimeout(() => setSent(false), 3000);
  };

  const c = {
    primary: "#378ADD", primaryDark: "#185FA5",
    bg: "#f7f8fa", card: "#ffffff",
    text: "#1a1a1a", textSub: "#666", textHint: "#aaa",
    border: "#e8e8e8", borderMid: "#d0d0d0",
    danger: "#e24b4a"
  };

  const s = {
    wrap: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 430, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column", background: c.bg },
    header: { padding: "16px 20px 12px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: 10, background: c.card, position: "sticky", top: 0, zIndex: 10 },
    backBtn: { background: "none", border: "none", cursor: "pointer", color: c.textSub, padding: 4, display: "flex", alignItems: "center", fontSize: 22 },
    title: { fontSize: 17, fontWeight: 600, margin: 0, color: c.text },
    body: { flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 12 },
    card: { background: c.card, borderRadius: 14, padding: "16px 18px", border: `1px solid ${c.border}` },
    primaryBtn: { width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: c.primary, cursor: "pointer", fontSize: 16, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
    outlineBtn: { width: "100%", padding: "14px 0", borderRadius: 14, border: `1.5px solid ${c.borderMid}`, background: c.card, cursor: "pointer", fontSize: 15, fontWeight: 500, color: c.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
    input: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${c.border}`, fontSize: 15, background: c.card, color: c.text, outline: "none" },
    label: { fontSize: 13, color: c.textSub, marginBottom: 6, display: "block", fontWeight: 500 },
    recItem: { background: c.card, borderRadius: 12, padding: "14px 16px", marginBottom: 8, border: `1px solid ${c.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" },
    delBtn: { background: "none", border: "none", cursor: "pointer", color: c.textHint, padding: 4, fontSize: 18, flexShrink: 0 },
    statCard: { flex: 1, background: c.card, borderRadius: 12, padding: "14px", textAlign: "center", border: `1px solid ${c.border}` },
    statNum: { fontSize: 26, fontWeight: 700, color: c.primary, margin: 0 },
    statLbl: { fontSize: 12, color: c.textSub, margin: "3px 0 0" },
    toast: { position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.8)", color: "#fff", padding: "11px 24px", borderRadius: 24, fontSize: 14, zIndex: 999, whiteSpace: "nowrap" },
  };

  if (view === views.CAMERA) return (
    <div style={{ ...s.wrap, background: "#000" }}>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 10, background: "rgba(0,0,0,0.5)" }}>
        <button style={{ background: "none", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, cursor: "pointer", color: "#fff", padding: "8px 14px", fontSize: 20 }} onClick={() => { stopCamera(); setView(views.HOME); }}>←</button>
        <span style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>계기판 촬영</span>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: "82%", height: "36%", border: "2.5px solid rgba(255,255,255,0.85)", borderRadius: 14, boxShadow: "0 0 0 9999px rgba(0,0,0,0.38)" }} />
        </div>
        <p style={{ position: "absolute", bottom: 120, width: "100%", textAlign: "center", color: "rgba(255,255,255,0.85)", fontSize: 13, margin: 0 }}>주행거리 숫자가 틀 안에 오도록 맞춰주세요</p>
      </div>
      <div style={{ padding: "16px 20px 32px", display: "flex", gap: 12, background: "rgba(0,0,0,0.5)" }}>
        <button style={{ padding: "14px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", cursor: "pointer", fontSize: 15, color: "#fff" }} onClick={() => { stopCamera(); setView(views.HOME); }}>취소</button>
        <button style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#000" }} onClick={capture}>📸 촬영</button>
      </div>
    </div>
  );

  if (view === views.FORM) return (
    <div style={s.wrap}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => { stopCamera(); setView(views.HOME); }}>←</button>
        <p style={s.title}>운행 정보 입력</p>
      </div>
      <div style={s.body}>
        {capturedImage && <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${c.border}` }}><img src={capturedImage} alt="계기판" style={{ width: "100%", display: "block", maxHeight: 190, objectFit: "cover" }} /></div>}
        {analyzing && (
          <div style={{ ...s.card, display: "flex", alignItems: "center", gap: 12 }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 18, height: 18, border: `2.5px solid ${c.primary}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: c.textSub }}>AI가 주행거리를 읽는 중...</span>
          </div>
        )}
        <div><label style={s.label}>날짜</label><input type="date" style={s.input} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
        <div><label style={s.label}>거래처명 *</label><input type="text" placeholder="거래처 이름 입력" style={s.input} value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div>
        <div><label style={s.label}>주행거리(km) *</label><input type="number" placeholder="주행거리" style={s.input} value={form.odometer} onChange={e => setForm(f => ({ ...f, odometer: e.target.value }))} /></div>
        <div><label style={s.label}>메모</label><input type="text" placeholder="메모 (선택)" style={s.input} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} /></div>
        <button style={s.primaryBtn} onClick={saveRecord}>💾 저장</button>
      </div>
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );

  if (view === views.LIST) return (
    <div style={s.wrap}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => setView(views.HOME)}>←</button>
        <p style={s.title}>운행 기록 ({records.length}건)</p>
      </div>
      <div style={{ flex: 1, padding: "16px" }}>
        {records.length === 0
          ? <div style={{ textAlign: "center", marginTop: 80, color: c.textHint }}><div style={{ fontSize: 48 }}>📋</div><p style={{ marginTop: 12, fontSize: 14 }}>기록이 없습니다</p></div>
          : records.map(r => (
            <div key={r.id} style={s.recItem}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 12, color: c.textHint }}>{r.date}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: c.text }}>{r.client}</span>
                <span style={{ fontSize: 14, color: c.primary, fontWeight: 500 }}>🚗 {Number(r.odometer).toLocaleString()} km</span>
                {r.memo && <span style={{ fontSize: 13, color: c.textSub }}>{r.memo}</span>}
              </div>
              <button style={s.delBtn} onClick={() => deleteRecord(r.id)}>🗑️</button>
            </div>
          ))}
      </div>
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );

  if (view === views.SEND) return (
    <div style={s.wrap}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => setView(views.HOME)}>←</button>
        <p style={s.title}>내보내기</p>
      </div>
      <div style={s.body}>
        <div style={s.card}><p style={{ margin: 0, fontSize: 14, color: c.textSub }}>총 <strong style={{ color: c.text }}>{records.length}건</strong>의 운행 기록을 CSV 파일로 저장합니다. 엑셀에서 바로 열 수 있어요.</p></div>
        <div><label style={s.label}>이메일 주소 (참고용)</label><input type="email" placeholder="example@email.com" style={s.input} value={email} onChange={e => setEmail(e.target.value)} /></div>
        <button style={{ ...s.primaryBtn, opacity: records.length === 0 ? 0.5 : 1 }} onClick={handleExport} disabled={records.length === 0 || sending}>
          {sending ? "처리 중..." : sent ? "✅ 완료!" : "📥 CSV 다운로드"}
        </button>
        <p style={{ fontSize: 12, color: c.textHint, textAlign: "center", margin: 0 }}>다운로드된 파일을 이메일로 직접 첨부해 보내시면 돼요.</p>
      </div>
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );

  // HOME
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRecs = records.filter(r => r.date?.startsWith(thisMonth));

  return (
    <div style={s.wrap}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus{border-color:${c.primary}!important;box-shadow:0 0 0 3px ${c.primary}22}`}</style>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileUpload} />

      <div style={{ padding: "24px 20px 10px", background: c.card, borderBottom: `1px solid ${c.border}` }}>
        <p style={{ margin: 0, fontSize: 13, color: c.textHint }}>{new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</p>
        <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: c.text }}>법인차량 운행일지</p>
      </div>

      <div style={s.body}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={s.statCard}><p style={s.statNum}>{records.length}</p><p style={s.statLbl}>전체 기록</p></div>
          <div style={s.statCard}><p style={s.statNum}>{monthRecs.length}</p><p style={s.statLbl}>이번 달</p></div>
        </div>

        <button style={s.primaryBtn} onClick={startCamera}>📷 계기판 촬영하기</button>
        <button style={s.outlineBtn} onClick={() => fileInputRef.current?.click()}>🖼️ 사진 업로드하기</button>
        <button style={s.outlineBtn} onClick={() => { setCapturedImage(null); setForm({ date: new Date().toISOString().slice(0,10), client: "", odometer: "", memo: "" }); setView(views.FORM); }}>✏️ 직접 입력하기</button>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...s.outlineBtn, flex: 1 }} onClick={() => setView(views.LIST)}>📋 기록 보기</button>
          <button style={{ ...s.outlineBtn, flex: 1 }} onClick={() => setView(views.SEND)}>📤 내보내기</button>
        </div>

        {records.length > 0 && (
          <div>
            <p style={{ margin: "4px 0 10px", fontSize: 13, color: c.textSub, fontWeight: 600 }}>최근 기록</p>
            {records.slice(0, 3).map(r => (
              <div key={r.id} style={{ ...s.recItem, marginBottom: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 12, color: c.textHint }}>{r.date}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{r.client}</span>
                    <span style={{ fontSize: 13, color: c.primary }}>{Number(r.odometer).toLocaleString()} km</span>
                  </div>
                  {r.memo && <span style={{ fontSize: 13, color: c.textSub }}>{r.memo}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}