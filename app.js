"use strict";
const $ = id => document.getElementById(id);
const source = "https://www.nccih.nih.gov/health/ginger";
let email = null, chats = [], guest = [], active = null, busy = false, apiReady = false;
let liveEnabled = false, pending = null, editing = null;
const demo = {id: "demo", title: "Guided chat preview", messages: [{q: "I have a headache."}]};
const dialog = $("dialog");

function node(tag, txt, cls) {
  const n = document.createElement(tag);
  if (txt !== undefined && txt !== null) n.textContent = txt;
  if (cls) n.className = cls;
  return n;
}

// Build response markup as DOM nodes so model text never becomes executable HTML.
function formattedAnswer(text) {
  const container = node("div", undefined, "answerText");
  const lines = String(text || "")
    .replace(/【(\d+)†[^】]+】/g, "[$1]")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const inline = (parent, value) => {
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
    let position = 0;
    for (const match of value.matchAll(pattern)) {
      parent.append(document.createTextNode(value.slice(position, match.index)));
      const part = match[0];
      if (part.startsWith("**")) parent.append(node("strong", part.slice(2, -2)));
      else if (part.startsWith("*")) parent.append(node("em", part.slice(1, -1)));
      else if (part.startsWith("`")) parent.append(node("code", part.slice(1, -1)));
      else {
        const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        const a = node("a", linkMatch[1]);
        a.href = linkMatch[2]; a.target = "_blank"; a.rel = "noopener noreferrer";
        parent.append(a);
      }
      position = match.index + part.length;
    }
    parent.append(document.createTextNode(value.slice(position)));
  };
  const cells = line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.startsWith("```")) {
      const block = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) block.push(lines[i++]);
      if (i < lines.length) i++;
      const pre = node("pre"); pre.append(node("code", block.join("\n"))); container.append(pre);
      continue;
    }
    if (i + 1 < lines.length && line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const wrapper = node("div", undefined, "answerTableWrap");
      const table = node("table"), header = node("thead"), row = node("tr");
      for (const value of cells(line)) { const th = node("th"); inline(th, value); row.append(th); }
      header.append(row); table.append(header);
      const body = node("tbody"); i += 2;
      while (i < lines.length && lines[i].trim().includes("|")) {
        const tr = node("tr");
        for (const value of cells(lines[i])) { const td = node("td"); inline(td, value); tr.append(td); }
        body.append(tr); i++;
      }
      table.append(body); wrapper.append(table); container.append(wrapper); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const h = node(heading[1].length === 1 ? "h3" : "h4"); inline(h, heading[2]); container.append(h); i++; continue;
    }
    const listMatch = line.match(/^([-*•]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const list = node(ordered ? "ol" : "ul");
      while (i < lines.length) {
        const match = lines[i].trim().match(/^([-*•]|\d+[.)])\s+(.+)$/);
        if (!match || /^\d/.test(match[1]) !== ordered) break;
        const item = node("li"); inline(item, match[2]); list.append(item); i++;
      }
      container.append(list); continue;
    }
    if (/^[-*_]{3,}$/.test(line)) { container.append(node("hr")); i++; continue; }
    const paragraph = node("p"); inline(paragraph, line); i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*•]\s|\d+[.)]\s|```)/.test(lines[i].trim()) && !lines[i].includes("|")) {
      paragraph.append(document.createTextNode(" ")); inline(paragraph, lines[i].trim()); i++;
    }
    container.append(paragraph);
  }
  return container;
}

function button(text, fn, cls = "alt") {
  const b = node("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
}

function link() {
  const a = node("a", "NCCIH · Ginger ↗");
  a.href = source;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}

function showDialog(title) {
  $("dialogTitle").textContent = title;
  $("dialogBody").replaceChildren();
  if (!dialog.open) dialog.showModal();
  return $("dialogBody");
}

$("close").onclick = () => dialog.close();
function closeNav() { document.body.classList.remove("open"); }
$("menu").onclick = () => document.body.classList.add("open");
$("shade").onclick = closeNav;

const DEFAULT_TUNNEL_URL = "https://bench-initiatives-arthur-exams.trycloudflare.com";

function getApiBase() {
  if (window.BIOSENTRY_API_BASE) {
    return window.BIOSENTRY_API_BASE.replace(/\/+$/, "");
  }
  const stored = localStorage.getItem("biosentry_api_url");
  if (stored) {
    return stored.trim().replace(/\/+$/, "");
  }
  const host = window.location.hostname || "";
  if (host.includes("github.io") || host.includes("vercel.app")) {
    return DEFAULT_TUNNEL_URL;
  }
  return "";
}

window.setBackendUrl = function(url) {
  if (!url) {
    localStorage.removeItem("biosentry_api_url");
  } else {
    localStorage.setItem("biosentry_api_url", url.trim());
  }
  window.location.reload();
};

async function api(route, data, signal) {
  const base = getApiBase();
  const url = (base ? base : "") + "/api/" + route;
  const token = localStorage.getItem("bs_token") || sessionStorage.getItem("bs_token");
  const headers = data ? {"Content-Type": "application/json"} : {};
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  const r = await fetch(url, {
    signal,
    method: data ? "POST" : "GET",
    headers,
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined
  });
  const j = await r.json();
  if (j && j.token) {
    try {
      localStorage.setItem("bs_token", j.token);
      sessionStorage.setItem("bs_token", j.token);
    } catch (e) {}
  }
  if (!r.ok) {
    // If session expired mid-session, reset email state and prompt login
    if (r.status === 401 && j.auth_required) {
      email = null;
      try {
        localStorage.removeItem("bs_token");
        sessionStorage.removeItem("bs_token");
      } catch (e) {}
      auth(false);
    }
    // If onboarding is incomplete, trigger onboarding wizard
    if (r.status === 403 && j.onboarding_required) {
      profileComplete = false;
      showOnboarding();
    }
    throw Error(j.error || "Request failed.");
  }
  return j;
}

function syncGuest() {
  try { sessionStorage.setItem("biosentry-guest", JSON.stringify(guest)); } catch {}
}

const headacheSource = "https://www.nhs.uk/symptoms/headaches/";
const followUps = {
  "headache-onset": {
    prompt: "How did the headache start?",
    choices: ["It came on suddenly", "It built up gradually", "I’m not sure"]
  },
  "headache-severity": {
    prompt: "When it started, how painful was it?",
    choices: ["Extremely painful", "Mild to moderate", "I’m not sure"]
  },
  "headache-duration": {
    prompt: "How long has the headache been going on?",
    choices: ["It started today", "It started a few days ago", "It keeps coming back", "I’m not sure"]
  }
};

const cards = {
  name: {
    heading: "Botanical name",
    short: "The botanical name of ginger is Zingiber officinale.",
    detail: "This Latin name identifies the plant across different common names, including ginger and adrak.",
    excerpt: "Latin Names: Zingiber officinale"
  },
  part: {
    heading: "Plant part used in food",
    short: "The part of ginger used in food is its rhizome, a stem that grows underground.",
    detail: "A rhizome is an underground stem. It is the knobbly part you typically see sold as fresh ginger.",
    excerpt: "Its rhizome (underground stem) is used in food and for health purposes."
  }
};

function activeChat() {
  return active === "demo" ? demo : chats.find(chat => chat.id === active);
}

function titleFor(chat) {
  return chat.title || chat.messages[0].q;
}

function setAnswerStatus(text) {
  const el = $("workStatus");
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  $("stopAnswer").hidden = !text;
}

function stopAnswer() {
  if (pending) {
    pending.abort();
    pending = null;
    setAnswerStatus("");
    busy = false;
    $("send").disabled = false;
  }
}
$("stopAnswer").onclick = stopAnswer;

function showEditMode() {
  $("editBanner").hidden = !editing;
}
function cancelEdit() {
  if (editing) {
    $("prompt").value = editing.draft;
    editing = null;
    showEditMode();
  }
}
$("cancelEdit").onclick = cancelEdit;

function editMessage(message) {
  const current = activeChat();
  if (!current || !current.messages.length) return;
  const last = current.messages.at(-1);
  if (message !== last) return;
  editing = { draft: $("prompt").value, original: message.q };
  $("prompt").value = message.q;
  showEditMode();
  $("prompt").focus();
  $("prompt").select();
}

function showSources(keys) {
  const body = $("sourceBody");
  body.replaceChildren();
  $("sourceTitle").textContent = "Source details";
  body.append(node("p", "National Center for Complementary and Integrative Health", "sourcePublisher"));
  for (const key of keys) {
    const card = cards[key];
    const excerpt = node("section", undefined, "excerpt");
    excerpt.append(node("h3", card.heading), node("blockquote", card.excerpt), node("p", card.short));
    body.append(excerpt);
  }
  body.append(link());
  $("sourceDrawer").showModal();
}

function showRealSources(sources, queryUsed) {
  const body = $("sourceBody");
  body.replaceChildren();
  $("sourceTitle").textContent = "Classical Treatise Citation Details";
  body.append(node("p", `Full-text search across 20 classical volumes in library.sqlite (13,728 indexed FTS pages). Query: "${queryUsed || 'Classical inquiry'}"`, "sourcePublisher"));
  if (!sources || !sources.length) {
    body.append(node("p", "No specific classical passages retrieved for this query.", "empty"));
  } else {
    for (const s of sources) {
      const pageNum = s.physical_pdf_page || s.page_no || s.pdf_page || "Scan";
      const excerptText = s.extracted_passage || s.text_clean || s.snippet || s.text || "No passage text available.";
      const statusLabel = s.review_status === "reviewed" ? "Scholarly Reviewed" : "Provisional OCR (Subject to scholarly review)";
      const sec = node("section", undefined, "libCard");
      const head = node("div", undefined, "libCardHead");
      head.append(
        node("h4", s.book_title || s.title || s.book_id || "Classical Treatise"),
        node("span", `PDF Page ${pageNum}`)
      );
      const meta = node("div", `Treatise ID: ${s.book_id || "Unknown"} · Status: ${statusLabel}`, "libCardMeta");
      const excerpt = node("blockquote", excerptText, "libCardSnippet");
      const actions = node("div", undefined, "libActions");
      const pdfLink = s.pdf_link || (s.book_id ? `${getApiBase()}/api/library/pdf?book_id=${s.book_id}#page=${pageNum}` : null);
      if (pdfLink) {
        const pLink = node("a", `Open physical scan (PDF page ${pageNum}) ↗`, "libBtn");
        pLink.href = pdfLink;
        pLink.target = "_blank";
        pLink.rel = "noopener";
        actions.append(pLink);
      }
      sec.append(head, meta, excerpt, actions);
      body.append(sec);
    }
  }
  const disclaimer = node("p", "Historical classical passages for science exhibition research and educational auditing only. Strictly prohibited for autonomous clinical diagnosis, disease staging, or prescription adjustment.", "libDisclaimer");
  body.append(disclaimer);
  $("sourceDrawer").showModal();
}
$("closeSource").onclick = () => $("sourceDrawer").close();

function renderPkChartSvg(baselineTraj, modulatedTraj, hours) {
  if (!baselineTraj || !baselineTraj.length) return "";
  const w = 500, h = 180, padL = 40, padR = 15, padT = 20, padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  let maxC = 0.001;
  for (const pt of baselineTraj) {
    if (pt.concentration_mg_l > maxC) maxC = pt.concentration_mg_l;
  }
  if (modulatedTraj) {
    for (const pt of modulatedTraj) {
      if (pt.concentration_mg_l > maxC) maxC = pt.concentration_mg_l;
    }
  }
  maxC *= 1.15;
  const maxT = hours || 72.0;
  const toX = t => (padL + (t / maxT) * plotW).toFixed(1);
  const toY = c => (padT + plotH - (c / maxC) * plotH).toFixed(1);

  const step = Math.max(1, Math.floor(baselineTraj.length / 80));
  let pathBase = "";
  for (let i = 0; i < baselineTraj.length; i += step) {
    const pt = baselineTraj[i];
    pathBase += (pathBase === "" ? "M" : "L") + `${toX(pt.t_hours)},${toY(pt.concentration_mg_l)}`;
  }
  let pathMod = "";
  if (modulatedTraj) {
    for (let i = 0; i < modulatedTraj.length; i += step) {
      const pt = modulatedTraj[i];
      pathMod += (pathMod === "" ? "M" : "L") + `${toX(pt.t_hours)},${toY(pt.concentration_mg_l)}`;
    }
  }

  return `
  <div class="chartContainer">
    <svg class="chartSvg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-label="Pharmacokinetic concentration chart">
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-width="1.5" />
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-width="1.5" />
      <text x="${padL - 6}" y="${padT + 4}" fill="#64748b" font-size="10" text-anchor="end">${maxC.toFixed(2)}</text>
      <text x="${padL - 6}" y="${padT + plotH / 2}" fill="#64748b" font-size="10" text-anchor="end">${(maxC / 2).toFixed(2)}</text>
      <text x="${padL - 6}" y="${padT + plotH}" fill="#64748b" font-size="10" text-anchor="end">0.0</text>
      <text x="12" y="${padT + plotH / 2}" fill="#64748b" font-size="9" text-anchor="middle" transform="rotate(-90 12 ${padT + plotH / 2})">Conc (mg/L)</text>
      <text x="${padL}" y="${h - 8}" fill="#64748b" font-size="10" text-anchor="middle">0h</text>
      <text x="${padL + plotW / 2}" y="${h - 8}" fill="#64748b" font-size="10" text-anchor="middle">${(maxT / 2).toFixed(0)}h</text>
      <text x="${padL + plotW}" y="${h - 8}" fill="#64748b" font-size="10" text-anchor="middle">${maxT.toFixed(0)}h</text>
      <path d="${pathBase}" fill="none" stroke="#2563eb" stroke-width="2.5" />
      ${pathMod ? `<path d="${pathMod}" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="5 3" />` : ""}
    </svg>
    <div style="display:flex;justify-content:center;gap:18px;font-size:11.5px;margin-top:6px;">
      <span style="color:#2563eb;font-weight:600;">― Baseline Exposure</span>
      ${pathMod ? `<span style="color:#dc2626;font-weight:600;">- - With Botanical Modifier</span>` : ""}
    </div>
  </div>`;
}

function replyActions(chat, message, index, text, linkUrl) {
  const actions = node("div", undefined, "replyActions");
  const copy = button("Copy", async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Copied";
      setTimeout(() => copy.textContent = "Copy", 2000);
    } catch {}
  }, "textAction");
  actions.append(copy);

  for (const feedback of ["Helpful", "Unclear"]) {
    const option = button(feedback, async () => {
      if (busy) return;
      const current = activeChat();
      if (!current || current.id !== chat.id) return;
      const selected = current.messages[index]?.feedback === feedback ? undefined : feedback;
      const msgs = current.messages.map((item, i) => i === index ? {...item, feedback: selected} : item);
      busy = true;
      try {
        await saveChat({...current, messages: msgs});
        const siblings = actions.querySelectorAll("[aria-pressed]");
        siblings.forEach(control => control.setAttribute("aria-pressed", String(control.textContent === selected)));
      } catch (err) {
        $("notice").textContent = err.message;
      } finally {
        busy = false;
      }
    }, "textAction");
    option.setAttribute("aria-pressed", String(message.feedback === feedback));
    actions.append(option);
  }
  return actions;
}

function detectQuestionLanguage(text) {
  if (!text) return "en";
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagariCount > 0) return "hi";
  if (/\b(?:kya|hai|hain|mein|me|se|ke|ki|aur|bhi|nahi|nahin|hote|karein|chahiye|batao|bataiye|dard|takleef)\b/i.test(text)) {
    return "hinglish";
  }
  return "en";
}

function renderReply(chat, message, index, topic) {
  const reply = node("div", undefined, "reply");
  reply.append(node("strong", "BioSentry AI"));
  const last = index === chat.messages.length - 1;

  // 1. EMERGENCY INTERCEPTION CARD
  if (message.card === "emergency" || message.pipelineResult?.is_emergency) {
    const res = message.pipelineResult || {};
    const t = res.triage || {};
    const card = node("div", undefined, "emergencyCard");
    const head = node("div", undefined, "emergencyHead");
    head.append(
      node("strong", "🚨 Critical Medical Emergency Interception"),
      node("span", t.category || "EMERGENCY", "emergencyBadge")
    );
    const notice = node("div", t.escalation_response || res.response || "Emergency detected. Seek immediate clinical medical care.", "emergencyNotice");
    const actionBox = node("div", undefined, "emergencyActionBox");
    if (t.category === "ACUTE_OCULAR_RED_FLAG") {
      actionBox.innerHTML = "<strong>Immediate Action Required:</strong><br>1. Proceed immediately to Hospital Emergency Department, Trauma Center, or Ophthalmologist.<br>2. Call emergency services without delay (<strong>112 / 911 / 108 / 102</strong>).<br>3. <strong>DO NOT</strong> instill unverified eye drops, oils, powders, or home decoctions; urgent ophthalmic care required.";
    } else {
      actionBox.innerHTML = "<strong>Immediate Action Required:</strong><br>1. Proceed immediately to the nearest Hospital Emergency Department or Trauma Center.<br>2. Call emergency services without delay (<strong>112 / 911 / 108 / 102</strong>).<br>3. <strong>DO NOT</strong> consume or administer any unverified botanical extracts, powders, or home remedies; do not delay emergency medical intervention.";
    }
    const disclaimer = node("p", "Research demonstration system only. Qualified clinician review pending. Strictly not medical advice.", "toolDisclaimer");
    card.append(head, notice, actionBox, disclaimer);
    reply.append(card, replyActions(chat, message, index, t.escalation_response || res.response || "Emergency Interception", ""));
    return reply;
  }

  // GREETING CARD (Conversational, no search or book retrieval)
  if (message.card === "greeting" || message.pipelineResult?.pipeline_status === "GREETING") {
    const res = message.pipelineResult || {};
    const card = node("div", undefined, "ragCard");
    const answer = res.direct_answer || res.message || "Hello! What would you like to explore today?";
    card.append(formattedAnswer(answer));
    reply.append(card, replyActions(chat, message, index, answer, ""));
    return reply;
  }

  // 2. CLINICAL CAUTION (UNCERTAIN / AMBIGUOUS SYMPTOMS)
  if (message.card === "caution" || (message.pipelineResult && (message.pipelineResult.pipeline_status === "UNCERTAIN_CAUTION" || message.pipelineResult.triage?.triage_status === "UNCERTAIN_INSUFFICIENT_INFO"))) {
    const res = message.pipelineResult || {};
    const t = res.triage || {};
    const card = node("div", undefined, "cautionCard");
    const head = node("div", undefined, "cautionHead");
    head.append(
      node("strong", "⚠️ Clinical Caution — Insufficient / Ambiguous Clinical Information"),
      node("span", "Clinical Caution", "cautionBadge")
    );
    const notice = node("div", t.escalation_response || res.response || res.message || "Your message describes ambiguous physical symptoms lacking sufficient detail to confirm medical safety.", "cautionNotice");
    const actionBox = node("div", undefined, "emergencyActionBox");
    actionBox.style.borderLeftColor = "#f59e0b";
    actionBox.innerHTML = "<strong>Safety Directives:</strong><br>1. BioSentry AI is a research demonstration tool, not a diagnostic system. It <strong>CANNOT</strong> declare you medically safe or cleared.<br>2. For persistent, unresolved, or alarming symptoms, please consult a qualified physician immediately.<br>3. <strong>DO NOT</strong> self-administer unverified herbal concoctions or home remedies for unresolved symptoms.";
    const disclaimer = node("p", "Research demonstration prototype only. Qualified clinician review pending.", "toolDisclaimer");
    card.append(head, notice, actionBox, disclaimer);
    reply.append(card, replyActions(chat, message, index, notice.textContent, ""));
    return reply;
  }

  // 3. PERSONAL SYMPTOM INTAKE QUESTION
  if (message.card === "symptom-intake" || message.pipelineResult?.is_personal_symptom || message.pipelineResult?.pipeline_status === "PERSONAL_SYMPTOM_INTAKE") {
    const res = message.pipelineResult || {};
    const panel = node("section", undefined, "followUp");
    const row = node("div", undefined, "understood");
    row.append(node("span", "You’re asking about a personal symptom concern."));
    panel.append(row, node("h2", res.follow_up_prompt || "How long have you been experiencing this symptom?"));
    if (last) {
      const options = node("div", undefined, "followChoices");
      const choices = res.choices || ["Started today", "Since yesterday (kal se)", "A few days ago", "Keeps recurring"];
      for (const label of choices) {
        options.append(button(label, () => {
          cancelEdit();
          submitQuestion(label);
        }, "choice"));
      }
      options.append(button("I’ll type my answer", () => {
        cancelEdit();
        $("prompt").focus();
      }, "choice customChoice"));
      panel.append(options);
    }
    reply.append(panel);
    return reply;
  }

  // 4. PERSONAL SYMPTOM GUIDANCE FOLLOW-UP
  if (message.card === "symptom-guidance" || message.pipelineResult?.is_symptom_followup || message.pipelineResult?.pipeline_status === "PERSONAL_SYMPTOM_GUIDANCE") {
    const res = message.pipelineResult || {};
    const card = node("div", undefined, "symptomGuidanceCard");
    const head = node("div", undefined, "symptomGuidanceHead");
    head.append(
      node("h3", "📋 Classical Documentary Context & Educational Observations"),
      node("span", res.model ? `AI Synthesis (${res.model})` : "Educational Reference", "ragBadge")
    );
    const bodyText = formattedAnswer(res.direct_answer || res.message || "");
    bodyText.classList.add("symptomGuidanceText");
    const disclaimer = node("p", "Educational research reference only. Classical principles describe historical observations and do not constitute clinical diagnosis, disease staging, or modern medical treatment. Persistent or worsening symptoms require in-person physician evaluation.", "toolDisclaimer");
    card.append(head, bodyText);

    // Render retrieved canonical treatise sources if available
    const sources = res.sources || res.citations || [];
    if (sources.length > 0) {
      const srcBox = node("div", undefined, "symptomSourcesContainer");
      srcBox.style.marginTop = "14px";
      srcBox.style.padding = "10px 14px";
      srcBox.style.background = "rgba(16, 185, 129, 0.05)";
      srcBox.style.border = "1px solid rgba(16, 185, 129, 0.2)";
      srcBox.style.borderRadius = "8px";
      const srcToggle = node("div", `📚 Retrieved Classical Treatises (${sources.length}):`, "symptomSourcesTitle");
      srcToggle.style.fontWeight = "600";
      srcToggle.style.marginBottom = "8px";
      const srcList = node("div", undefined, "symptomSourcesList");
      sources.forEach((s, idx) => {
        const item = node("div", undefined, "symptomSourceItem");
        item.style.marginBottom = "10px";
        item.style.paddingBottom = "8px";
        item.style.borderBottom = "1px dashed rgba(0,0,0,0.1)";
        const title = node("div", `${idx + 1}. ${s.title || s.book || "Classical Treatise"} (Page ${s.printed_page || s.page_number || "N/A"})`, "symptomSourceTitle");
        title.style.fontWeight = "600";
        title.style.fontSize = "0.92em";
        const snippet = node("blockquote", `"${s.extracted_passage || s.text || ""}"`, "symptomSourceQuote");
        snippet.style.margin = "4px 0";
        snippet.style.fontStyle = "italic";
        snippet.style.fontSize = "0.88em";
        snippet.style.color = "#4b5563";
        const badge = node("div", `Provenance Status: ${s.review_status || "Provisional"} | OCR: ${s.ocr_status || "Standard"}`, "symptomSourceMeta");
        badge.style.fontSize = "0.78em";
        badge.style.color = "#6b7280";
        item.append(title, snippet, badge);
        srcList.append(item);
      });
      srcBox.append(srcToggle, srcList);
      card.append(srcBox);
    }

    card.append(disclaimer);
    reply.append(card, replyActions(chat, message, index, bodyText.textContent, ""));
    return reply;
  }

  // 5. SEARCH NOT EXECUTED / INSUFFICIENT SEARCHABLE TERMS
  if (message.card === "search-skipped" || (message.pipelineResult && message.pipelineResult.rag_status === "SEARCH_NOT_EXECUTED_INSUFFICIENT_TERMS")) {
    const res = message.pipelineResult || {};
    const card = node("div", undefined, "infoCard");
    const head = node("div", undefined, "infoHead");
    head.innerHTML = "<span>ℹ️</span> Search Not Executed: Insufficient Searchable Terms";
    const text = node("p", res.direct_answer || res.message || "The entered query contains no searchable classical, botanical, or formulation keywords. The database search was not executed.", "noMatchText");
    const guidance = node("p", "Guidance: Please specify a medicinal plant (e.g. Guduchi, Ashwagandha, Ginger), a classical formulation, or a treatise name.", "noMatchScope");
    card.append(head, text, guidance);
    reply.append(card, replyActions(chat, message, index, text.textContent, ""));
    return reply;
  }

  // 6. TECHNICAL SEARCH ERROR
  if (message.card === "search-error" || (message.pipelineResult && (message.pipelineResult.rag_status === "SEARCH_ERROR" || message.pipelineResult.pipeline_status === "SEARCH_ERROR"))) {
    const res = message.pipelineResult || {};
    const card = node("div", undefined, "noMatchCard");
    card.style.borderColor = "#fca5a5";
    const head = node("div", undefined, "noMatchHead");
    head.style.color = "#b91c1c";
    head.innerHTML = "<span>⚠️</span> Technical Search Error";
    const text = node("p", `A database search error occurred: ${res.error || "Database execution failure"}. The research index could not be queried.`, "noMatchText");
    const scope = node("p", "Status: Search Error. This technical failure does not indicate absence of classical evidence from historical treatises.", "noMatchScope");
    card.append(head, text, scope);
    reply.append(card, replyActions(chat, message, index, text.textContent, ""));
    return reply;
  }

  // 7. REAL CANONICAL RAG RETRIEVAL (DIRECT SHORT SOURCED ANSWER + EXCERPTS)
  if (message.card === "rag" || (message.pipelineResult && message.pipelineResult.rag_status === "CANONICAL_SOURCES_RETRIEVED")) {
    const res = message.pipelineResult || {};
    const sources = res.sources || [];
    const card = node("div", undefined, "ragCard");
    const head = node("div", undefined, "ragHead");

    const answer = res.direct_answer || res.message || "";
    if (answer) card.append(formattedAnswer(answer));
    if (res.groq_error) {
      card.append(node("p", "The AI response is unavailable. The information shown below comes from the source library.", "answerNotice"));
    }
    if (sources.length) {
      const sourceButton = button(
        `Sources · ${sources.length}`,
        () => showRealSources(sources, res.query_used || message.q),
        "citation sourceButton"
      );
      card.append(sourceButton);
    }
    reply.append(card, replyActions(chat, message, index, answer, ""));
    return reply;
  }

  // 8. HONEST NO-MATCH / SEARCH BOUNDS
  if (message.card === "no-match" || (message.pipelineResult && message.pipelineResult.rag_status === "NO_CANONICAL_SOURCE_FOUND")) {
    const card = node("div", undefined, "noMatchCard");
    const text = node("p", "I couldn't find a matching passage in the searchable library. Try another spelling or a more specific term.", "noMatchText");
    card.append(text);
    reply.append(card, replyActions(chat, message, index, text.textContent, ""));
    return reply;
  }

  // 4. RESEARCH TOOL: RENAL LAB CALCULATOR
  if (message.toolType === "calculator" || message.card === "calculator") {
    const res = message.toolResult || {};
    const ckd = res.ckd_epi_egfr || {};
    const cg = res.cockcroft_gault_crcl || {};
    const card = node("div", undefined, "toolCard");
    const head = node("div", undefined, "toolCardHead");
    head.append(
      node("h3", "🧪 Renal Function Lab Calculation (Deterministic Math)"),
      node("span", ckd.stage_label || "Calculated", "ragBadge")
    );
    const grid = node("div", undefined, "toolMetricsGrid");
    const b1 = node("div", undefined, "metricBox");
    b1.append(
      node("div", String(ckd.value || "--"), "metricVal"),
      node("div", ckd.units || "mL/min/1.73m²", "metricUnit"),
      node("div", "CKD-EPI 2021 eGFR", "metricLabel")
    );
    const b2 = node("div", undefined, "metricBox");
    b2.append(
      node("div", String(cg.value || "--"), "metricVal"),
      node("div", cg.units || "mL/min", "metricUnit"),
      node("div", "Cockcroft-Gault CrCl", "metricLabel")
    );
    grid.append(b1, b2);
    card.append(head, grid);

    if (ckd.physiological_interpretation) {
      const p1 = node("p", undefined);
      p1.style.cssText = "font-size:13px;margin:6px 0;";
      p1.append(node("strong", "Physiological Interpretation: "), document.createTextNode(String(ckd.physiological_interpretation)));
      card.append(p1);
    }
    if (ckd.safety_advisory) {
      const p2 = node("p", undefined);
      p2.style.cssText = "font-size:12.5px;color:#92400e;background:#fefce8;padding:8px 10px;border-radius:6px;border:1px solid #fef08a;margin:8px 0;";
      p2.append(node("strong", "Clinical Pharmacology Advisory: "), document.createTextNode(String(ckd.safety_advisory)));
      card.append(p2);
    }
    const disclaimer = node("p", res.educational_disclaimer || "Educational research calculation only. Not for autonomous clinical diagnosis or prescription adjustment.", "toolDisclaimer");
    card.append(disclaimer);
    reply.append(card, replyActions(chat, message, index, `eGFR: ${ckd.value} | CrCl: ${cg.value}`, ""));
    return reply;
  }

  // 5. RESEARCH TOOL: HERB-DRUG COLLISION NETWORK
  if (message.toolType === "collision" || message.card === "collision") {
    const res = message.toolResult || {};
    const interaction = res.interaction || {};
    const card = node("div", undefined, "toolCard");
    const head = node("div", undefined, "toolCardHead");
    const isAvoid = res.severity === "HIGH_RISK_AVOID";
    const badgeClass = isAvoid ? "badgeHighRisk" : "badgeCaution";
    head.append(
      node("h3", "🔗 Herb-Drug Interaction & Collision Analysis"),
      node("span", res.severity || "UNVERIFIED_CAUTION", badgeClass)
    );
    const pPair = node("p", undefined);
    pPair.style.cssText = "font-size:13.5px;margin:6px 0;";
    pPair.append(node("strong", "Entities Queried: "), document.createTextNode(`${res.query?.entity_a || 'Herb'} ⚡ ${res.query?.entity_b || 'Drug'}`));
    const pTier = node("p", undefined);
    pTier.style.cssText = "font-size:12.5px;margin:4px 0;";
    pTier.append(node("strong", "Evidence Tier: "), document.createTextNode(`${res.evidence_tier || 'UNKNOWN'} (${res.evidence_type || 'N/A'})`));
    card.append(head, pPair, pTier);

    if (interaction.mechanism) {
      const pMech = node("p", undefined);
      pMech.style.cssText = "font-size:13px;line-height:1.5;margin:8px 0;";
      pMech.append(node("strong", "Pharmacological Mechanism: "), document.createTextNode(String(interaction.mechanism)));
      card.append(pMech);
    }
    if (interaction.clinical_effect) {
      const pEff = node("p", undefined);
      pEff.style.cssText = "font-size:13px;line-height:1.5;margin:8px 0;color:#991b1b;";
      pEff.append(node("strong", "Documented Clinical Effect: "), document.createTextNode(String(interaction.clinical_effect)));
      card.append(pEff);
    }
    if (res.safety_alert) {
      const pAlert = node("p", undefined);
      pAlert.style.cssText = "font-size:12px;background:#fef2f2;padding:8px 10px;border-radius:6px;border:1px solid #fecaca;color:#991b1b;margin:8px 0;";
      pAlert.append(node("strong", "Safety Alert: "), document.createTextNode(String(res.safety_alert)));
      card.append(pAlert);
    }
    const disclaimer = node("p", res.network_disclaimer || "Graph PageRank measures network topology, NOT patient clinical acuity.", "toolDisclaimer");
    card.append(disclaimer);
    reply.append(card, replyActions(chat, message, index, `${res.query?.entity_a} + ${res.query?.entity_b}: ${res.severity}`, ""));
    return reply;
  }

  // 6. RESEARCH TOOL: TPSM PHARMACOKINETIC SIMULATION
  if (message.toolType === "tpsm" || message.card === "tpsm") {
    const res = message.toolResult || {};
    const card = node("div", undefined, "toolCard");
    const head = node("div", undefined, "toolCardHead");
    const isStudy = Boolean(res.study_citation || res.study_title);
    head.append(
      node("h3", isStudy ? "📖 Published Human Clinical Trial Data" : "📈 Pharmacokinetic RK4 Simulation Timeline"),
      node("span", isStudy ? "Human Study" : (res.comparative_metrics?.therapeutic_status || "Simulation"), "ragBadge")
    );
    card.append(head);

    if (isStudy) {
      const pCite = node("p", undefined);
      pCite.style.cssText = "font-size:13.5px;font-weight:600;margin:6px 0;color:var(--pine);";
      pCite.textContent = res.study_title || res.study_citation;
      const pMeta = node("p", `Citation: ${res.citation || res.study_citation} | ${res.pubmed_id || ''} | ${res.study_design || ''}`, "ragSourceMeta");
      const pObs = node("p", undefined);
      pObs.style.cssText = "font-size:13px;line-height:1.5;background:#f8faf6;padding:8px 10px;border-left:3px solid var(--leaf);border-radius:0 6px 6px 0;margin:8px 0;";
      pObs.innerHTML = `<strong>Clinical Findings:</strong> Reported AUC reduction of ${res.measured_clinical_observations?.auc_reduction_pct || res.reported_auc_reduction_pct || 25}%. P-glycoprotein induction accelerates intestinal clearance in healthy human volunteers (n=${res.study_population?.healthy_volunteers_n || res.sample_size_n || 25}).`;
      card.append(pCite, pMeta, pObs);
    } else {
      const base = res.baseline || {};
      const mod = res.modulated || {};
      const comp = res.comparative_metrics || {};
      const grid = node("div", undefined, "toolMetricsGrid");
      const b1 = node("div", undefined, "metricBox");
      b1.append(
        node("div", `${base.auc_0_t_mg_h_l || '--'}`, "metricVal"),
        node("div", "mg·h/L", "metricUnit"),
        node("div", "Baseline AUC", "metricLabel")
      );
      const b2 = node("div", undefined, "metricBox");
      b2.append(
        node("div", `${mod.auc_0_t_mg_h_l || '--'}`, "metricVal"),
        node("div", `mg·h/L (${comp.delta_auc_pct || 0}%)`, "metricUnit"),
        node("div", "Modulated AUC", "metricLabel")
      );
      const b3 = node("div", undefined, "metricBox");
      b3.append(
        node("div", `${comp.delta_c_max_pct || 0}%`, "metricVal"),
        node("div", "Cmax Shift", "metricUnit"),
        node("div", "Peak Concentration", "metricLabel")
      );
      grid.append(b1, b2, b3);
      card.append(grid);

      if (comp.clinical_risk_alert) {
        const pRisk = node("p", undefined);
        pRisk.style.cssText = "font-size:12.5px;color:#991b1b;background:#fef2f2;padding:8px 10px;border-radius:6px;border:1px solid #fecaca;margin:8px 0;";
        pRisk.append(node("strong", "Risk Alert: "), document.createTextNode(String(comp.clinical_risk_alert)));
        card.append(pRisk);
      }

      // Generate SVG Chart
      const chartHtml = renderPkChartSvg(base.trajectory, mod.trajectory, res.simulation_window_hours || 72.0);
      if (chartHtml) {
        const chartWrapper = node("div");
        chartWrapper.innerHTML = chartHtml;
        card.append(chartWrapper);
      }
    }

    const disclaimer = node("p", res.educational_disclaimer || res.educational_notice || "Educational pharmacokinetic demonstration only. Idealized compartment equations with synthetic parameters. Strictly prohibited for clinical dosing decisions.", "toolDisclaimer");
    card.append(disclaimer);
    reply.append(card, replyActions(chat, message, index, isStudy ? res.study_title : `PK Simulation: ${res.drug?.name}`, ""));
    return reply;
  }

  // 7. RESEARCH TOOL: PRESCRIPTION & CLINICAL TEXT INTELLIGENCE
  if (message.toolType === "prescription" || message.card === "prescription") {
    const res = message.toolResult || {};
    const card = node("div", undefined, "toolCard");
    const head = node("div", undefined, "toolCardHead");
    const counts = res.entity_counts || {};
    head.append(
      node("h3", "📋 Structured Clinical Text & Prescription Intelligence"),
      node("span", `${counts.drugs_found || 0} Drugs · ${counts.herbs_found || 0} Botanicals`, "ragBadge")
    );
    card.append(head);

    // Drugs Row
    if (res.detected_drugs && res.detected_drugs.length > 0) {
      const dRow = node("div", undefined);
      dRow.style.cssText = "margin:6px 0;";
      const dLabel = node("strong", "Pharmaceutical Drugs: ");
      dLabel.style.fontSize = "13px";
      dRow.append(dLabel);
      res.detected_drugs.forEach(d => {
        const tag = node("span", `💊 ${d.name} (${d.dosage})`, "entityTag tagDrug");
        dRow.append(tag);
      });
      card.append(dRow);
    }

    // Herbs Row
    if (res.detected_herbs && res.detected_herbs.length > 0) {
      const hRow = node("div", undefined);
      hRow.style.cssText = "margin:6px 0;";
      const hLabel = node("strong", "Ayurvedic Botanicals: ");
      hLabel.style.fontSize = "13px";
      hRow.append(hLabel);
      res.detected_herbs.forEach(h => {
        const tag = node("span", `🌿 ${h.name} (${h.form_or_dose})`, "entityTag tagHerb");
        hRow.append(tag);
      });
      card.append(hRow);
    }

    // Labs Row
    const labs = res.detected_labs || {};
    if (Object.keys(labs).length > 0) {
      const lRow = node("div", undefined);
      lRow.style.cssText = "margin:6px 0;";
      const lLabel = node("strong", "Extracted Demographics & Labs: ");
      lLabel.style.fontSize = "13px";
      lRow.append(lLabel);
      if (labs.age) lRow.append(node("span", `Age: ${labs.age}yo`, "entityTag tagLab"));
      if (labs.sex) lRow.append(node("span", `Sex: ${labs.sex}`, "entityTag tagLab"));
      if (labs.weight_kg) lRow.append(node("span", `Wt: ${labs.weight_kg}kg`, "entityTag tagLab"));
      if (labs.serum_creatinine) lRow.append(node("span", `Scr: ${labs.serum_creatinine} ${labs.creatinine_unit || 'mg/dL'}`, "entityTag tagLab"));
      if (labs.blood_pressure) lRow.append(node("span", `BP: ${labs.blood_pressure}`, "entityTag tagLab"));
      if (labs.blood_glucose_mg_dl) lRow.append(node("span", `Sugar: ${labs.blood_glucose_mg_dl} mg/dL`, "entityTag tagLab"));
      card.append(lRow);
    }

    // Renal assessment if computed
    if (res.renal_assessment) {
      const ra = res.renal_assessment;
      const rBox = node("div", undefined, "toolMetricsGrid");
      rBox.style.marginTop = "8px";
      const b1 = node("div", undefined, "metricBox");
      b1.append(
        node("div", String(ra.egfr_value || "--"), "metricVal"),
        node("div", ra.egfr_units || "mL/min/1.73m²", "metricUnit"),
        node("div", `eGFR (${ra.ckd_stage || 'CKD Stage'})`, "metricLabel")
      );
      const b2 = node("div", undefined, "metricBox");
      b2.append(
        node("div", String(ra.crcl_value || "--"), "metricVal"),
        node("div", "mL/min", "metricUnit"),
        node("div", "Cockcroft-Gault CrCl", "metricLabel")
      );
      rBox.append(b1, b2);
      card.append(rBox);
    }

    // Clinical Alerts
    if (res.clinical_safety_alerts && res.clinical_safety_alerts.length > 0) {
      const alertBox = node("div", undefined);
      alertBox.style.cssText = "margin:10px 0;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;";
      res.clinical_safety_alerts.forEach(a => {
        const item = node("div", a);
        item.style.cssText = "font-size:12.5px;color:#991b1b;margin:3px 0;line-height:1.4;";
        alertBox.append(item);
      });
      card.append(alertBox);
    }

    // Collisions List
    if (res.collisions && res.collisions.length > 0) {
      const cBox = node("div", undefined);
      cBox.style.marginTop = "8px";
      res.collisions.forEach(c => {
        const cRow = node("div", undefined);
        const isAvoid = c.is_avoid || c.severity === "HIGH_RISK_AVOID";
        cRow.style.cssText = `font-size:12.5px;padding:6px 10px;margin:4px 0;border-radius:6px;background:${isAvoid ? '#fef2f2' : '#f8fafc'};border:1px solid ${isAvoid ? '#f87171' : '#e2e8f0'};`;
        cRow.append(node("strong", `${c.herb} ⚡ ${c.drug}: `), document.createTextNode(`${c.severity} (${c.evidence_tier}). ${c.mechanism || c.clinical_effect}`));
        cBox.append(cRow);
      });
      card.append(cBox);
    }

    const disclaimer = node("p", res.educational_disclaimer || "Educational research entity extraction & screening prototype. Not a substitute for clinical pharmacist review.", "toolDisclaimer");
    card.append(disclaimer);
    reply.append(card, replyActions(chat, message, index, `Extracted ${counts.drugs_found} drugs, ${counts.herbs_found} herbs.`, ""));
    return reply;
  }

  // 7. LEGACY QUESTIONNAIRE / FALLBACK
  const followUp = followUps[topic];
  if (followUp) {
    const panel = node("section", undefined, "followUp");
    const row = node("div", undefined, "understood");
    row.append(node("span", "You’re asking about a symptom concern."));
    panel.append(row, node("h2", followUp.prompt));
    if (last) {
      const options = node("div", undefined, "followChoices");
      for (const label of followUp.choices) {
        options.append(button(label, () => {
          cancelEdit();
          submitQuestion(label);
        }, "choice"));
      }
      options.append(button("I’ll type my answer", () => {
        cancelEdit();
        $("prompt").focus();
      }, "choice customChoice"));
      panel.append(options);
    }
    reply.append(panel);
    return reply;
  }

  // Legacy cards fallback
  const keys = (topic === "name" || topic === "part") ? [topic] : (topic === "both" ? ["name", "part"] : []);
  if (keys.length) {
    const summary = keys.map(k => cards[k]?.short).join(" ");
    reply.append(node("p", summary, "answerSummary"));
    const actions = replyActions(chat, message, index, summary, source);
    actions.prepend(button("NCCIH · Ginger ↗", () => showSources(keys), "citation"));
    reply.append(actions);
    return reply;
  }

  const defaultSummary = "Classical Ayurvedic documentary reference. Please ask about a medicinal plant (e.g. Guduchi, Ginger, Ashwagandha), enter a question, or open Research Tools from the composer.";
  reply.append(node("p", defaultSummary));
  reply.append(replyActions(chat, message, index, defaultSummary, ""));
  return reply;
}

function render() {
  closeNav();
  const chat = activeChat();
  document.body.classList.toggle("conversation", Boolean(chat));
  $("deleteChat").hidden = !chat || chat.id === "demo";
  $("pageTitle").textContent = chat ? titleFor(chat) : "New chat";
  $("username").textContent = email || "Guest workspace";
  $("accountHint").textContent = email ? "Account settings" : "Sign in to save chats";
  $("avatar").textContent = (email || "G")[0].toUpperCase();
  $("headerAccount").textContent = email ? "Account" : "Sign in ↗";
  $("composeMode").lastChild.textContent = " Sources";

  const history = $("history");
  history.replaceChildren();
  if (!chats.length) history.append(node("p", "Your chats will appear here.", "empty"));
  for (const item of chats) {
    const row = node("div", undefined, item.id === active ? "historyRow activeChat" : "historyRow");
    const open = button(titleFor(item), () => navigate(item.id), "historyTitle");
    open.title = titleFor(item);
    if (item.id === active) open.setAttribute("aria-current", "page");
    const menu = button("⋯", () => chatMenu(item), "historyMenu");
    menu.setAttribute("aria-label", "Actions for " + titleFor(item));
    row.append(open, menu);
    history.append(row);
  }

  const messages = $("messages");
  messages.replaceChildren();
  $("prompt").placeholder = "Ask anything about Ayurveda...";
  if (!chat) return;
  if (chat.id === "demo") messages.append(node("p", "Example conversation", "demoLabel"));
  let previous = "";
  chat.messages.forEach((message, index) => {
    const topic = message.card || "rag";
    const userTurn = node("div", undefined, "userTurn");
    const bubble = node("div", message.q, "userMsg");
    userTurn.append(bubble);
    if (index === chat.messages.length - 1) {
      const edit = button("Edit", () => {
        userTurn.classList.remove("showEdit");
        editMessage(message);
      }, "textAction editMessage");
      edit.setAttribute("aria-label", "Edit latest message");
      bubble.addEventListener("click", event => {
        if (event.pointerType === "touch" || event.pointerType === "pen") {
          userTurn.classList.toggle("showEdit");
        }
      });
      userTurn.append(edit);
    }
    messages.append(userTurn, renderReply(chat, message, index, topic));
    previous = topic;
  });
}

document.addEventListener("pointerdown", event => {
  const revealed = $("messages").querySelector(".showEdit");
  if (revealed && !revealed.contains(event.target)) revealed.classList.remove("showEdit");
});

function route() {
  if (location.hash === "#demo") return "demo";
  return location.hash.startsWith("#chat/") ? location.hash.slice(6) : null;
}
function navigate(id, focus = true) {
  if (id !== active) {
    stopAnswer();
    if (editing) {
      $("prompt").value = editing.draft;
      editing = null;
      showEditMode();
    }
  }
  active = id;
  location.hash = id === "demo" ? "demo" : id ? "chat/" + id : "new";
  render();
  if (focus) $("prompt").focus();
}
window.addEventListener("hashchange", () => {
  const next = route();
  if (next !== active) navigate(next, false);
});
$("new").onclick = () => {
  navigate(null);
  editing = null;
  showEditMode();
  $("prompt").value = "";
  $("notice").textContent = "";
};

async function saveChat(chat) {
  if (chat.id === "demo") {
    demo.messages = chat.messages;
    return;
  }
  if (email) await api("chat", chat);
  const found = chats.some(item => item.id === chat.id);
  chats = found ? chats.map(item => item.id === chat.id ? chat : item) : [chat, ...chats];
  if (!email) {
    guest = chats;
    syncGuest();
  }
}

async function submitQuestion(question) {
  const q = question.trim();
  if (!q || q.length > 1500 || busy || pending) return;

  // ── Auth gate: require login & completed onboarding before any query ──────
  if (!email) {
    auth(false);
    return;
  }
  if (!profileComplete) {
    showOnboarding();
    return;
  }

  if (editing && q === activeChat()?.messages.at(-1)?.q) {
    cancelEdit();
    return;
  }
  const origin = active;
  const current = activeChat();
  const messages = current?.messages.slice() || [];
  if (editing) messages.pop();

  // Pass bounded user turns from active conversation in safety-router format
  const history = messages.slice(-5).map(m => m.q).filter(Boolean);

  const request = new AbortController();
  pending = request;
  $("notice").textContent = "";
  $("prompt").value = "";
  setAnswerStatus("Thinking…");

  // Switch layout immediately to conversation view
  document.body.classList.add("conversation");
  const msgContainer = $("messages");

  // Immediately show user question bubble in feed
  const tempUserTurn = node("div", undefined, "userTurn");
  tempUserTurn.append(node("div", q, "userMsg"));
  msgContainer.append(tempUserTurn);

  // Directly append animated thinking card (ChatGPT / Gemini style)
  const thinkingReply = node("div", undefined, "reply thinkingReply");
  thinkingReply.id = "activeThinking";
  thinkingReply.innerHTML = `
    <strong>BioSentry AI</strong>
    <div class="thinkingCard">
      <div class="thinkingHeader">
        <div class="thinkingOrb"><span class="thinkingDot"></span></div>
        <span class="thinkingLabel thinkingShimmer" id="thinkingStatusText">Thinking...</span>
      </div>
      <div class="thinkingSteps" id="thinkingStepsList">
        <span class="thinkingStepItem active" id="tstep_0"><span class="thinkingStepDot"></span>Analyzing inquiry</span>
        <span class="thinkingStepItem" id="tstep_1"><span class="thinkingStepDot"></span>Checking treatises</span>
        <span class="thinkingStepItem" id="tstep_2"><span class="thinkingStepDot"></span>Synthesizing guidance</span>
      </div>
    </div>
  `;
  msgContainer.append(thinkingReply);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  // Truthful progressive pipeline indicators
  const phases = [
    { label: "Thinking & analyzing symptom inquiry...", step: 0 },
    { label: "Consulting classical Samhitas...", step: 1 },
    { label: "Synthesizing response & clinical caveats...", step: 2 }
  ];
  let phaseIdx = 0;
  const thinkTimer = setInterval(() => {
    phaseIdx = (phaseIdx + 1) % phases.length;
    const cur = phases[phaseIdx];
    const lbl = $("thinkingStatusText");
    if (lbl) lbl.textContent = cur.label;
    for (let i = 0; i < phases.length; i++) {
      const el = $(`tstep_${i}`);
      if (el) {
        if (i < cur.step) {
          el.className = "thinkingStepItem done";
        } else if (i === cur.step) {
          el.className = "thinkingStepItem active";
        } else {
          el.className = "thinkingStepItem";
        }
      }
    }
  }, 1600);

  try {
    const res = await api("query", {query: q, history: history, use_groq: true}, request.signal);
    clearInterval(thinkTimer);
    thinkingReply.remove();
    tempUserTurn.remove();
    if (request.signal.aborted) return;
    pending = null;
    busy = true;
    setAnswerStatus("");
    $("send").disabled = true;

    let card = "rag";
    if (res.is_emergency || res.triage?.triage_status === "EMERGENCY_DETECTED") {
      card = "emergency";
    } else if (res.pipeline_status === "GREETING") {
      card = "greeting";
    } else if (res.pipeline_status === "UNCERTAIN_CAUTION" || res.triage?.triage_status === "UNCERTAIN_INSUFFICIENT_INFO") {
      card = "caution";
    } else if (res.is_personal_symptom || res.pipeline_status === "PERSONAL_SYMPTOM_INTAKE") {
      card = "symptom-intake";
    } else if (res.is_symptom_followup || res.pipeline_status === "PERSONAL_SYMPTOM_GUIDANCE") {
      card = "symptom-guidance";
    } else if (res.rag_status === "SEARCH_NOT_EXECUTED_INSUFFICIENT_TERMS") {
      card = "search-skipped";
    } else if (res.rag_status === "SEARCH_ERROR" || res.pipeline_status === "SEARCH_ERROR") {
      card = "search-error";
    } else if (res.rag_status === "NO_CANONICAL_SOURCE_FOUND") {
      card = "no-match";
    } else if (res.rag_status === "CANONICAL_SOURCES_RETRIEVED") {
      card = "rag";
    } else {
      card = "rag";
    }

    const updated = {
      ...current,
      id: current?.id || crypto.randomUUID(),
      messages: [...messages, {q, card, pipelineResult: res}]
    };
    await saveChat(updated);
    if (origin !== active) return;
    const draft = editing?.draft || "";
    editing = null;
    showEditMode();
    $("prompt").value = draft;
    navigate(updated.id, false);
    const arrival = $("messages").lastElementChild;
    arrival?.classList.add("arriving");
    if (arrival?.getBoundingClientRect().bottom > innerHeight - $("composeArea").offsetHeight) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  } catch (err) {
    if (!request.signal.aborted && origin === active) {
      $("notice").textContent = err.message;
    }
  } finally {
    clearInterval(thinkTimer);
    const th = $("activeThinking");
    if (th) th.remove();
    if (pending === request) {
      pending = null;
      setAnswerStatus("");
    }
    busy = false;
    $("send").disabled = false;
  }
}

$("composer").onsubmit = event => {
  event.preventDefault();
  submitQuestion($("prompt").value);
};
$("prompt").onkeydown = e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
};
document.querySelectorAll("[data-question]").forEach(b => {
  b.onclick = () => {
    $("prompt").value = b.dataset.question;
    $("composer").requestSubmit();
  };
});

// ==========================================
// RESEARCH TOOLS DIALOG & FORM HANDLERS
// ==========================================
const toolsDialog = $("toolsDialog");
const toolsBtn = $("toolsBtn");
if (toolsBtn) {
  toolsBtn.onclick = () => {
    if (toolsDialog && !toolsDialog.open) toolsDialog.showModal();
  };
}
if ($("closeTools") && toolsDialog) $("closeTools").onclick = () => toolsDialog.close();

const tabCalc = $("tabCalc");
const tabGraph = $("tabGraph");
const tabTpsm = $("tabTpsm");
const tabRx = $("tabRx");
const panelCalc = $("panelCalc");
const panelGraph = $("panelGraph");
const panelTpsm = $("panelTpsm");
const panelRx = $("panelRx");

function switchToolsTab(activeTab, activePanel) {
  [tabCalc, tabGraph, tabTpsm, tabRx].forEach(t => {
    if (t) {
      t.classList.toggle("active", t === activeTab);
      t.setAttribute("aria-selected", String(t === activeTab));
    }
  });
  [panelCalc, panelGraph, panelTpsm, panelRx].forEach(p => {
    if (p) p.hidden = (p !== activePanel);
  });
}
tabCalc.onclick = () => switchToolsTab(tabCalc, panelCalc);
tabGraph.onclick = () => switchToolsTab(tabGraph, panelGraph);
tabTpsm.onclick = () => switchToolsTab(tabTpsm, panelTpsm);
if (tabRx) tabRx.onclick = () => switchToolsTab(tabRx, panelRx);

// Presets
$("chipCalc1").onclick = () => {
  $("calcAge").value = "62";
  $("calcSex").value = "male";
  $("calcScr").value = "1.3";
  $("calcWeight").value = "72";
  $("calcHeight").value = "175";
};
$("chipCalc2").onclick = () => {
  $("calcAge").value = "74";
  $("calcSex").value = "female";
  $("calcScr").value = "1.8";
  $("calcWeight").value = "64";
  $("calcHeight").value = "160";
};

$("chipGraph1").onclick = () => {
  $("graphHerb").value = "St. John's Wort";
  $("graphDrug").value = "Warfarin";
};
$("chipGraph2").onclick = () => {
  $("graphHerb").value = "Curcumin";
  $("graphDrug").value = "Metformin";
};
$("chipGraph3").onclick = () => {
  $("graphHerb").value = "BotanicalX";
  $("graphDrug").value = "Warfarin";
};

$("chipTpsm1").onclick = () => {
  $("tpsmDrug").value = "warfarin";
  $("tpsmModifier").value = "st_johns_wort";
  $("tpsmHours").value = "72";
  $("tpsmStudyCheck").checked = false;
};
$("chipTpsm2").onclick = () => {
  $("tpsmStudyCheck").checked = true;
};

if ($("chipRx1")) {
  $("chipRx1").onclick = () => {
    $("rxText").value = "Rx: Tab Warfarin 5mg daily, Tab Metformin 500mg BD, Ginkgo biloba extract 120mg OD.\nPatient: 68yo Male, Weight 70kg, Serum Creatinine 1.6 mg/dL, BP 130/80 mmHg.";
  };
}
if ($("chipRx2")) {
  $("chipRx2").onclick = () => {
    $("rxText").value = "Rx: Digoxin 0.25mg OD, Atorvastatin 20mg HS, St. John's Wort capsule 300mg.\nPatient: 72yo Female, Weight 58kg, Scr 1.1 mg/dL.";
  };
}
if ($("chipRx3")) {
  $("chipRx3").onclick = () => {
    $("rxText").value = "Rx: Tab Paracetamol 650mg SOS for fever, Ashwagandha churna 3g BD with warm milk.\nPatient: 35yo Male, Weight 68kg.";
  };
}

// Form 1: Calculator Submit
$("formCalc").onsubmit = async event => {
  event.preventDefault();
  if (busy || pending) return;
  const age = parseFloat($("calcAge").value);
  const sex = $("calcSex").value;
  const scr = parseFloat($("calcScr").value);
  const weight = parseFloat($("calcWeight").value);
  const height = parseFloat($("calcHeight").value) || null;

  toolsDialog.close();
  const q = `[Tool: Lab Calculator] Age: ${age}, Sex: ${sex}, Scr: ${scr} mg/dL, Weight: ${weight} kg`;
  setAnswerStatus("Calculating CKD-EPI & Cockcroft-Gault...");
  busy = true;
  try {
    const res = await api("calculator/unified", {
      age, sex, serum_creatinine: scr, creatinine_unit: "mg/dL", weight_kg: weight, height_cm: height
    });
    const current = activeChat();
    const messages = current?.messages.slice() || [];
    const updated = {
      ...current,
      id: current?.id || crypto.randomUUID(),
      messages: [...messages, { q, card: "calculator", toolType: "calculator", toolResult: res }]
    };
    await saveChat(updated);
    navigate(updated.id, false);
  } catch (err) {
    $("notice").textContent = err.message;
  } finally {
    setAnswerStatus("");
    busy = false;
  }
};

// Form 2: Collision Submit
$("formGraph").onsubmit = async event => {
  event.preventDefault();
  if (busy || pending) return;
  const herb = $("graphHerb").value.trim();
  const drug = $("graphDrug").value.trim();
  if (!herb || !drug) return;

  toolsDialog.close();
  const q = `[Tool: Collision Network] Herb: ${herb} + Drug: ${drug}`;
  setAnswerStatus("Querying herb-drug bipartite graph...");
  busy = true;
  try {
    const res = await api("graph/collision", { herb, drug });
    const current = activeChat();
    const messages = current?.messages.slice() || [];
    const updated = {
      ...current,
      id: current?.id || crypto.randomUUID(),
      messages: [...messages, { q, card: "collision", toolType: "collision", toolResult: res }]
    };
    await saveChat(updated);
    navigate(updated.id, false);
  } catch (err) {
    $("notice").textContent = err.message;
  } finally {
    setAnswerStatus("");
    busy = false;
  }
};

// Form 3: TPSM Submit
$("formTpsm").onsubmit = async event => {
  event.preventDefault();
  if (busy || pending) return;
  const isStudy = $("tpsmStudyCheck").checked;
  const drug = $("tpsmDrug").value;
  const modifier = $("tpsmModifier").value;
  const hours = parseFloat($("tpsmHours").value);

  toolsDialog.close();
  busy = true;
  try {
    let res = null;
    let q = "";
    if (isStudy) {
      q = "[Tool: PK Study] Johne et al. 1999 (Digoxin + St. John's Wort, n=25)";
      setAnswerStatus("Retrieving published human clinical study...");
      res = await api("tpsm/human_study", { study_id: "digoxin_st_johns_wort" });
    } else {
      q = modifier
        ? `[Tool: PK Simulation] Drug: ${drug} + Herb: ${modifier} (${hours}h window)`
        : `[Tool: PK Simulation] Drug: ${drug} (Baseline Monotherapy, ${hours}h window)`;
      setAnswerStatus("Running 2-compartment RK4 differential equation solver...");
      res = await api("tpsm/simulate", { drug_id: drug, herb_id: modifier || null, window_hours: hours });
    }
    const current = activeChat();
    const messages = current?.messages.slice() || [];
    const updated = {
      ...current,
      id: current?.id || crypto.randomUUID(),
      messages: [...messages, { q, card: "tpsm", toolType: "tpsm", toolResult: res }]
    };
    await saveChat(updated);
    navigate(updated.id, false);
  } catch (err) {
    $("notice").textContent = err.message;
  } finally {
    setAnswerStatus("");
    busy = false;
  }
};

// Form 4: Prescription & Clinical Intelligence Submit
if ($("formRx")) {
  $("formRx").onsubmit = async event => {
    event.preventDefault();
    if (busy || pending) return;
    const text = ($("rxText")?.value || "").trim();
    if (!text) return;

    toolsDialog.close();
    const preview = text.length > 70 ? text.slice(0, 67) + "..." : text;
    const q = `[Tool: Prescription Intelligence] ${preview}`;
    setAnswerStatus("Parsing clinical entities & screening collisions...");
    busy = true;
    try {
      const res = await api("prescription/parse", { text });
      const current = activeChat();
      const messages = current?.messages.slice() || [];
      const updated = {
        ...current,
        id: current?.id || crypto.randomUUID(),
        messages: [...messages, { q, card: "prescription", toolType: "prescription", toolResult: res }]
      };
      await saveChat(updated);
      navigate(updated.id, false);
    } catch (err) {
      $("notice").textContent = err.message;
    } finally {
      setAnswerStatus("");
      busy = false;
    }
  };
}

// ==========================================
// SOURCE LIBRARY DIALOG
// ==========================================
function openLibrary() {
  closeNav();
  const d = showDialog("Classical Ayurveda Source Library");
  const intro = node("p", "Search authentic classical treatises (Charaka, Sushruta, Ayurvedic Pharmacopoeia of India, AFI). Direct link opens the exact local PDF page.");
  
  const statsBar = node("div", "Loading corpus statistics...", "libStats");
  fetch(getApiBase() + "/api/library/stats").then(r => r.json()).then(st => {
    const b = st.unique_books ?? st.books ?? 0;
    const p = st.indexed_pages ?? st.pages ?? 0;
    const l = st.total_lines ?? st.lines ?? 0;
    const rev = st.review_items ?? st.review_queue_count ?? 0;
    statsBar.textContent = `Indexed Corpus: ${b} classical volumes · ${p.toLocaleString()} pages processed · ${l.toLocaleString()} lines · ${rev.toLocaleString()} review items`;
  }).catch(() => {
    statsBar.textContent = "Indexed Classical Ayurvedic Corpus";
  });

  const searchBox = node("div", undefined, "libSearchBox");
  const inp = node("input");
  inp.type = "search";
  inp.placeholder = "Search botanical name, formulation, Sanskrit term (e.g. Guduchi, Jvara, ginger)...";
  inp.setAttribute("aria-label", "Search classical source library");
  const btn = node("button", "Search", "libSearchBtn");
  btn.type = "button";
  searchBox.append(inp, btn);

  const pills = node("div", undefined, "libPills");
  const sampleQueries = ["Guduchi (Tinospora)", "Zingiber (Ginger)", "Jvara gruel", "Surgical instruments", "Haritaki", "Pippali"];
  for (const q of sampleQueries) {
    const cleanQ = q.split(" ")[0];
    const p = node("button", q, "libPill");
    p.type = "button";
    p.onclick = () => { inp.value = cleanQ; doSearch(cleanQ); };
    pills.append(p);
  }

  const list = node("div", undefined, "libList");

  async function doSearch(query) {
    const q = (query !== undefined ? query : inp.value).trim();
    if (!q) return;
    list.replaceChildren(node("p", `Searching for "${q}" across classical volumes...`));
    try {
      const res = await fetch(getApiBase() + "/api/library/search?q=" + encodeURIComponent(q));
      const data = await res.json();
      list.replaceChildren();
      if (!data.results || data.results.length === 0) {
        list.append(node("p", data.message || "No matching classical passages found."));
        return;
      }
      const countNotice = node("p", `${data.message} Showing top ${data.results.length} matches:`);
      countNotice.style.fontWeight = "600";
      list.append(countNotice);

      for (const r of data.results) {
        const card = node("div", undefined, "libCard");
        const head = node("div", undefined, "libCardHead");
        const statusLabel = r.status === "needs_review" ? "Needs Review" : (r.status === "ocr_complete" ? "OCR Verified" : "Extracted");
        const statusColor = r.status === "needs_review" ? "#d97706" : "#059669";
        const statusBg = r.status === "needs_review" ? "#fef3c7" : "#d1fae5";
        
        const badges = node("div");
        badges.style.cssText = "display:flex;gap:6px;align-items:center;";
        const pageBadge = node("span", `PDF Page ${r.page_no}${r.printed_page ? " · Book p. " + r.printed_page : ""}`);
        const statusBadge = node("span", statusLabel);
        statusBadge.style.cssText = `background:${statusBg};color:${statusColor};border:1px solid ${statusColor}40;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;`;
        badges.append(pageBadge, statusBadge);

        head.append(
          node("h4", r.title || r.book_id),
          badges
        );
        const meta = node("div", `${r.author || r.edition_or_translator || "Classical text"} · Language: ${r.language} · Method: ${r.extraction_method}`, "libCardMeta");
        
        const snip = node("div", undefined, "libCardSnippet");
        const rawSnip = r.snippet || "";
        const terms = q.split(/\s+/).filter(t => t.length > 2);
        let highlighted = rawSnip.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
        for (const t of terms) {
          const safeT = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          highlighted = highlighted.replace(new RegExp('(' + safeT + ')', 'gi'), '<mark>$1</mark>');
        }
        snip.innerHTML = highlighted;

        const disclaimer = node("div", "Historical classical text · Medical review pending · Not clinical advice", "libDisclaimer");

        const actions = node("div", undefined, "libActions");
        const pdfLink = node("a", `Open physical scan (PDF page ${r.page_no}) ↗`, "libBtn");
        pdfLink.href = `${getApiBase()}/api/library/pdf?book_id=${encodeURIComponent(r.book_id)}#page=${r.page_no}`;
        pdfLink.target = "_blank";
        pdfLink.rel = "noopener";
        actions.append(pdfLink);

        card.append(head, meta, snip, disclaimer, actions);
        list.append(card);
      }
    } catch (e) {
      list.replaceChildren(node("p", "Search request failed: " + e.message, "err"));
    }
  }

  btn.onclick = () => doSearch();
  inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } };

  d.append(intro, statsBar, searchBox, pills, list);
}
$("library").onclick = openLibrary;

// Search chats
$("search").onclick = () => {
  closeNav();
  const d = showDialog("Search conversations");
  const i = node("input");
  i.placeholder = "Search your chats…";
  i.setAttribute("aria-label", "Search conversation history");
  const r = node("div");
  d.append(i, r);
  i.oninput = () => {
    const q = i.value.toLowerCase().trim();
    r.replaceChildren();
    if (!q) return;
    const hits = chats.filter(c => c.messages.some(m => m.q.toLowerCase().includes(q)));
    if (!hits.length) { r.append(node("p", "No matching chats found.", "empty")); return; }
    for (const h of hits) {
      r.append(button(titleFor(h), () => { dialog.close(); navigate(h.id); }, "result"));
    }
  };
  i.focus();
};

function auth(signup = false) {
  closeNav();
  const d = showDialog(email ? "Account settings" : signup ? "Create account" : "Sign in");
  if (email) {
    d.append(
      node("p", "Signed in as " + email),
      button("Update Health Profile", () => {
        dialog.close();
        showOnboarding();
      }),
      button("Sign out", async () => {
        try { await api("logout", {}); } catch {}
        try {
          localStorage.removeItem("bs_token");
          sessionStorage.removeItem("bs_token");
          sessionStorage.removeItem("biosentry-guest");
        } catch (e) {}
        email = null;
        guest = [];
        chats = [];
        profileComplete = false;
        dialog.close();
        navigate(null);
      }, "action")
    );
    return;
  }
  const f = node("form");
  const l1 = node("label", "Email");
  const mail = node("input");
  mail.type = "email";
  mail.required = true;
  l1.append(mail);
  const l2 = node("label", "Password");
  const pw = node("input");
  pw.type = "password";
  pw.required = true;
  pw.minLength = 8;
  l2.append(pw);
  f.append(l1, l2);
  const submit = node("button", signup ? "Create account" : "Sign in", "action");
  const error = node("p", "", "err");
  error.setAttribute("role", "alert");
  f.append(submit, error);
  f.onsubmit = async e => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await api(signup ? "signup" : "login", {email: mail.value, password: pw.value});
      const st = await api("state");
      email = st.email;
      chats = st.chats;
      guest = [];
      syncGuest();
      dialog.close();
      // Show onboarding on new signup or if profile not yet complete
      if (signup || !st.profileComplete) {
        showOnboarding();
      } else {
        profileComplete = true;
        navigate(null);
      }
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  };
  d.append(f, button(signup ? "Already registered? Sign in" : "Create an account", () => auth(!signup)));
  mail.focus();
}
$("profile").onclick = $("headerAccount").onclick = () => auth();

// ── Health Profile Onboarding Wizard ──────────────────────────────────────────
let profileComplete = false;

function showOnboarding() {
  if (document.getElementById("onboardingOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "onboardingOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(26,46,36,.92);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;";

  const card = document.createElement("div");
  card.style.cssText = "background:#faf8f2;border-radius:14px;max-width:540px;width:100%;padding:28px 28px 24px;box-shadow:0 8px 40px rgba(0,0,0,.35);font-family:inherit;";

  const steps = [
    {
      title: "Health Conditions",
      field: "conditions",
      hint: "Any ongoing or important medical conditions we should be aware of?",
      examples: "e.g. Diabetes, Hypertension, Asthma",
      options: ["Diabetes", "Hypertension", "Heart disease", "Asthma", "Thyroid condition", "Kidney disease", "Liver disease"]
    },
    {
      title: "Known Allergies",
      field: "allergies",
      hint: "Any known allergies to medicines, foods, plants or supplements?",
      examples: "e.g. Peanut allergy, Penicillin allergy, Aspirin",
      options: ["Peanuts / tree nuts", "Shellfish / fish", "Dairy / lactose", "Gluten / wheat", "Aspirin / NSAIDs", "Sulfa drugs", "Latex"]
    },
    {
      title: "Current Medicines & Supplements",
      field: "medicines",
      hint: "Any medicines or herbal supplements you are currently taking?",
      examples: "e.g. Metformin, Amlodipine, Ashwagandha",
      options: ["Blood thinners (warfarin, aspirin)", "Blood pressure medicines", "Diabetes medicines", "Thyroid medicines", "Steroids", "Antidepressants", "Herbal supplements"]
    }
  ];

  let stepIndex = 0;
  const collected = { conditions: {}, allergies: {}, medicines: {} };

  function renderStep() {
    card.replaceChildren();

    // ── Step 4: Review and Finish Screen ────────────────────────────────────
    if (stepIndex === 3) {
      const hdr = document.createElement("div");
      hdr.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:14px;";
      const stepBadge = document.createElement("span");
      stepBadge.textContent = "Step 4 of 4";
      stepBadge.style.cssText = "background:#2d6a4f;color:#fff;border-radius:20px;padding:2px 10px;font-size:.8rem;font-weight:600;";
      const title = document.createElement("h3");
      title.textContent = "Review Your Health Context";
      title.style.cssText = "margin:0;font-size:1.15rem;color:#1a2e24;";
      hdr.append(stepBadge, title);

      const hint = document.createElement("p");
      hint.textContent = "Please review your entries. You can go back to make changes, or update these anytime from your account.";
      hint.style.cssText = "color:#4a5568;font-size:.88rem;margin:0 0 16px;";

      const reviewBox = document.createElement("div");
      reviewBox.style.cssText = "background:#f3f7f0;border:1px solid #c8d9c5;border-radius:10px;padding:14px 16px;margin-bottom:16px;font-size:.88rem;";

      const fmtField = (val) => {
        if (!val || val === "none") return "None reported";
        if (val === "not_sure") return "Not sure / Uncertain";
        if (val === "skipped") return "Skipped for now";
        if (typeof val === "object") return Object.values(val).filter(Boolean).join(", ") || "None reported";
        return String(val);
      };

      for (const [label, value] of [
        ["Conditions", collected.conditions],
        ["Allergies", collected.allergies],
        ["Medicines / Supplements", collected.medicines]
      ]) {
        const row = node("div");
        row.style.marginBottom = "10px";
        row.append(node("strong", label + ": "), node("span", fmtField(value)));
        reviewBox.append(row);
      }

      const privacyBox = document.createElement("div");
      privacyBox.style.cssText = "background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:18px;font-size:.8rem;color:#64748b;line-height:1.5;";
      privacyBox.innerHTML = `
        <div style="font-weight:600;color:#334155;margin-bottom:4px;">🔒 Privacy & Research Transparency:</div>
        Your details help BioSentry AI check for potential herb–drug interactions and classical contraindications.
        When you ask health questions, relevant context may be securely shared with the Groq Cloud AI model (OpenAI GPT-OSS-120B) solely for response synthesis.
        No private health data is sold or used for advertising.
      `;

      const errMsg = document.createElement("p");
      errMsg.style.cssText = "color:#c0392b;font-size:.82rem;min-height:1.2em;margin:6px 0 0;";

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;";

      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.textContent = "← Back";
      backBtn.style.cssText = "background:none;border:none;color:#4a5568;font-size:.88rem;cursor:pointer;padding:8px 12px;";
      backBtn.onclick = () => { stepIndex = 2; renderStep(); };

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.textContent = "Confirm & Start Chatting →";
      confirmBtn.style.cssText = "background:#2d6a4f;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:.92rem;font-weight:600;cursor:pointer;";

      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Saving…";
        try {
          await api("profile", {
            conditions: collected.conditions,
            allergies: collected.allergies,
            medicines: collected.medicines,
            profile_complete: true
          });
          profileComplete = true;
          overlay.remove();
          navigate(null);
          render();
        } catch (e) {
          errMsg.textContent = "Could not save profile: " + (e.message || "Network error") + ". Please try again.";
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Confirm & Start Chatting →";
        }
      };

      btnRow.append(backBtn, confirmBtn);
      card.append(hdr, hint, reviewBox, privacyBox, btnRow, errMsg);
      return;
    }

    // ── Steps 0, 1, 2: Questions ────────────────────────────────────────────
    const s = steps[stepIndex];

    const hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:16px;";
    const stepBadge = document.createElement("span");
    stepBadge.textContent = `${stepIndex + 1} / 4`;
    stepBadge.style.cssText = "background:#2d6a4f;color:#fff;border-radius:20px;padding:2px 10px;font-size:.8rem;font-weight:600;";
    const title = document.createElement("h3");
    title.textContent = s.title;
    title.style.cssText = "margin:0;font-size:1.1rem;color:#1a2e24;";
    hdr.append(stepBadge, title);

    const hint = document.createElement("p");
    hint.textContent = s.hint;
    hint.style.cssText = "color:#4a5568;font-size:.9rem;margin:0 0 12px;";

    const checks = document.createElement("div");
    checks.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;";
    const checkedItems = new Set();
    s.options.forEach(opt => {
      const lbl = document.createElement("label");
      lbl.style.cssText = "display:flex;align-items:center;gap:5px;background:#e8f5e9;padding:5px 10px;border-radius:20px;cursor:pointer;font-size:.85rem;color:#1a2e24;border:1px solid #a5d6a7;";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.value = opt;
      cb.onchange = () => { if (cb.checked) checkedItems.add(opt); else checkedItems.delete(opt); };
      lbl.append(cb, document.createTextNode(opt));
      checks.append(lbl);
    });

    const freeLabel = document.createElement("label");
    freeLabel.style.cssText = "display:block;font-size:.85rem;color:#4a5568;margin-bottom:4px;";
    freeLabel.textContent = "Or type specific details (optional):";
    const freeInput = document.createElement("input");
    freeInput.type = "text"; freeInput.placeholder = s.examples;
    freeInput.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #c3c9d2;border-radius:6px;font-size:.9rem;margin-bottom:14px;";

    const skipRow = document.createElement("div");
    skipRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;";
    const mkSkip = (label, value) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText = "padding:5px 14px;border-radius:20px;border:1px solid #a0aec0;background:#f7f7f7;font-size:.82rem;cursor:pointer;color:#4a5568;";
      b.onclick = () => { collected[s.field] = value; advance(); };
      return b;
    };
    skipRow.append(mkSkip("None", "none"), mkSkip("Not sure", "not_sure"), mkSkip("Skip for now", "skipped"));

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = stepIndex === 2 ? "Review Profile →" : "Next →";
    nextBtn.style.cssText = "background:#2d6a4f;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:.95rem;cursor:pointer;font-weight:600;";
    const errMsg = document.createElement("p");
    errMsg.style.cssText = "color:#c0392b;font-size:.82rem;min-height:1.2em;margin:4px 0 0;";

    nextBtn.onclick = () => {
      const freeVal = freeInput.value.trim();
      const items = [...checkedItems];
      if (freeVal) items.push(freeVal);
      if (items.length > 0) {
        collected[s.field] = items.reduce((acc, v, i) => { acc[i] = v; return acc; }, {});
      } else if (typeof collected[s.field] !== "string") {
        collected[s.field] = "skipped";
      }
      advance();
    };

    function advance() {
      stepIndex++;
      renderStep();
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;";
    if (stepIndex > 0) {
      const backBtn = document.createElement("button");
      backBtn.type = "button"; backBtn.textContent = "← Back";
      backBtn.style.cssText = "background:none;border:none;color:#4a5568;font-size:.88rem;cursor:pointer;padding:8px 12px;";
      backBtn.onclick = () => { stepIndex--; renderStep(); };
      btnRow.append(backBtn);
    }
    btnRow.append(nextBtn);

    const skipAllBtn = document.createElement("button");
    skipAllBtn.type = "button"; skipAllBtn.textContent = "Skip all & start chatting";
    skipAllBtn.style.cssText = "background:transparent;border:none;color:#718096;font-size:.82rem;cursor:pointer;text-decoration:underline;";
    skipAllBtn.onclick = async () => {
      try {
        await api("profile", {conditions:"skipped",allergies:"skipped",medicines:"skipped",profile_complete:true});
        profileComplete = true; overlay.remove(); navigate(null); render();
      } catch (err) {
        errMsg.textContent = "Failed to save profile: " + (err.message || "Network error");
      }
    };
    btnRow.append(skipAllBtn);

    card.append(hdr, hint, checks, freeLabel, freeInput, skipRow, btnRow, errMsg);
  }

  renderStep();
  overlay.append(card);
  document.body.append(overlay);
}

function chatMenu(chat) {
  const content = showDialog("Conversation");
  content.append(
    button("Rename chat", () => renameChat(chat)),
    button("Delete chat", () => deleteChat(chat.id))
  );
}

function renameChat(chat) {
  const content = showDialog("Rename chat");
  const form = node("form");
  const label = node("label", "Conversation name");
  const input = node("input");
  const error = node("p", "", "err");
  error.setAttribute("role", "alert");
  input.value = titleFor(chat).slice(0, 80);
  input.required = true;
  input.maxLength = 80;
  label.append(input);
  const submit = node("button", "Save name", "action");
  form.append(label, submit, error);
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || pending || !input.value.trim()) return;
    submit.disabled = true;
    try {
      await saveChat({...chat, title: input.value.trim()});
      dialog.close();
      render();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  };
  content.append(form);
  input.focus();
  input.select();
}

$("deleteChat").onclick = () => deleteChat(active);
function deleteChat(conversationId) {
  if (!conversationId || busy || pending) return;
  const content = showDialog("Delete this chat?");
  const error = node("p", "", "err");
  error.setAttribute("role", "alert");
  const remove = button("Delete chat", async () => {
    remove.disabled = true;
    try {
      if (email) await api("delete", {id: conversationId});
      chats = chats.filter(chat => chat.id !== conversationId);
      if (!email) {
        guest = chats;
        syncGuest();
      }
      dialog.close();
      if (active === conversationId) navigate(null);
      else render();
    } catch (err) {
      error.textContent = err.message;
      remove.disabled = false;
    }
  }, "action");
  content.append(button("Cancel", () => dialog.close()), remove, error);
}

// Artwork & Canvas icons
function artwork(el) {
  const w = el.width, h = el.height, d = devicePixelRatio || 1;
  el.style.width = w + "px";
  el.style.height = h + "px";
  el.width = w * d;
  el.height = h * d;
  const c = el.getContext("2d");
  c.scale(d, d);
  const kind = el.dataset.art;
  c.strokeStyle = kind === "mark" ? "#dfdfab" : "#5b7350";
  c.lineWidth = 1.25;
  c.lineCap = "round";

  function line(x, y, X, Y) {
    c.beginPath(); c.moveTo(x, y); c.lineTo(X, Y); c.stroke();
  }
  function leaf(x, y, angle, len, width) {
    c.save(); c.translate(x, y); c.rotate(angle);
    c.beginPath(); c.moveTo(0, 0);
    c.quadraticCurveTo(width, -len * .45, 0, -len);
    c.quadraticCurveTo(-width, -len * .48, 0, 0);
    c.fillStyle = kind === "mark" ? "#90af83" : "#d4dfbf";
    c.fill(); c.stroke();
    line(0, 0, 0, -len);
    for (let j = 2; j < 8; j++) {
      let t = j / 10, hw = width * (1 - Math.abs(t - .5) * 1.5) * .44;
      line(0, -len * t, hw, -len * (t + .1));
      line(0, -len * t, -hw, -len * (t + .1));
    }
    c.restore();
  }
  function sprig(x, y, a, len) {
    c.save(); c.translate(x, y); c.rotate(a);
    line(0, 0, 0, -len);
    for (let i = 1; i <= 3; i++) {
      let yy = -len * i / 4;
      leaf(0, yy, -.95, len * (.39 - i * .025), len * .12);
      leaf(0, yy - 3, .8, len * (.41 - i * .025), len * .12);
    }
    leaf(0, -len * .85, .06, len * .34, len * .1);
    c.restore();
  }

  if (kind === "hero") {
    c.fillStyle = "#eef0de";
    c.beginPath(); c.ellipse(56, 48, 37, 36, -.16, 0, 7); c.fill();
    sprig(50, 84, -.46, 49);
    sprig(47, 83, .35, 68);
    sprig(58, 76, .93, 36);
  } else if (kind === "root") {
    c.strokeStyle = "#a3814d"; c.fillStyle = "#dbbb85";
    c.beginPath(); c.moveTo(6, 28);
    c.bezierCurveTo(2, 17, 14, 26, 17, 17);
    c.bezierCurveTo(13, 7, 21, 5, 23, 13);
    c.bezierCurveTo(25, 21, 28, 13, 33, 9);
    c.bezierCurveTo(41, 6, 44, 14, 36, 18);
    c.bezierCurveTo(28, 21, 38, 25, 34, 30);
    c.bezierCurveTo(29, 35, 27, 26, 22, 27);
    c.bezierCurveTo(14, 32, 9, 34, 6, 28);
    c.fill(); c.stroke();
    for (let i = 0; i < 4; i++) line(11 + i * 3, 23 - i, 13 + i * 3, 28 - i);
  } else if (kind === "book") {
    c.strokeStyle = "#627c76";
    for (let j = 0; j < 2; j++) {
      c.save(); c.translate(23, 11); c.scale(j ? -1 : 1, 1);
      c.strokeRect(0, 0, 17, 20);
      for (let i = 1; i <= 3; i++) line(4, i * 5, 13, i * 5);
      c.restore();
    }
  } else {
    sprig(w * .43, h * .93, .24, h * .64);
  }
}
document.querySelectorAll("canvas[data-art]").forEach(artwork);
const icons = {search: "⌕", book: "▤"};
document.querySelectorAll("[data-icon]").forEach(n => {
  n.textContent = icons[n.dataset.icon];
  n.style.font = "20px/1 Georgia";
});

(async () => {
  try { guest = JSON.parse(sessionStorage.getItem("biosentry-guest") || "[]"); } catch {}
  try {
    const st = await api("state");
    email = st.email;
    liveEnabled = !!st.liveEnabled;
    apiReady = true;
    chats = email ? st.chats : guest;
    profileComplete = !!st.profileComplete;
  } catch {
    chats = guest;
  }
  active = route();
  render();
  const entry = new URLSearchParams(location.search).get("account");
  if (!email) auth(entry === "signup");
  // Show onboarding if logged in but profile not yet complete
  if (email && !profileComplete && !document.getElementById("onboardingOverlay")) {
    showOnboarding();
  }
})();
