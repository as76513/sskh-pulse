import { useEffect, useState } from 'react';
import { api, uploadToS3 } from '../api/client.js';

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [docType, setDocType] = useState('aadhaar');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setDocs(await api('/docs/mine'));
    setPayslips(await api('/payslips/mine'));
  }
  useEffect(() => { load(); }, []);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMsg(null); setBusy(true);
    try {
      const { upload_url, s3_key } = await api('/docs/upload-url', {
        method: 'POST',
        body: { doc_type: docType, file_name: file.name, content_type: file.type },
      });
      await uploadToS3(upload_url, file);
      await api('/docs/confirm', {
        method: 'POST',
        body: { doc_type: docType, file_name: file.name, s3_key },
      });
      setMsg({ ok: true, text: 'Uploaded' });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally { setBusy(false); e.target.value = ''; }
  }

  async function download(kind, id) {
    const { download_url } = await api(`/${kind}/${id}/download`);
    window.open(download_url, '_blank');
  }

  return (
    <>
      <div className="card">
        <h3>Upload Document</h3>
        <label>Document Type</label>
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="aadhaar">Aadhaar</option>
          <option value="pan">PAN</option>
          <option value="resume">Resume</option>
          <option value="offer_letter">Offer Letter</option>
          <option value="other">Other</option>
        </select>
        <label>File</label>
        <input type="file" onChange={handleFile} disabled={busy} />
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      </div>

      <div className="card">
        <h3>My Documents</h3>
        {docs.length === 0 && <div className="muted">No documents.</div>}
        {docs.map((d) => (
          <div className="list-item" key={d.id}>
            <div>
              <div>{d.doc_type}</div>
              <div className="muted">{d.file_name}</div>
            </div>
            <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12 }}
                    onClick={() => download('docs', d.id)}>View</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Payslips</h3>
        {payslips.length === 0 && <div className="muted">No payslips yet.</div>}
        {payslips.map((p) => (
          <div className="list-item" key={p.id}>
            <span>{p.pay_month}</span>
            <button className="btn secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12 }}
                    onClick={() => download('payslips', p.id)}>Download</button>
          </div>
        ))}
      </div>
    </>
  );
}
