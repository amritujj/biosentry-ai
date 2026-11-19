"use strict";
const $=id=>document.getElementById(id);
const source="https://www.nccih.nih.gov/health/ginger";
let email=null, chats=[], guest=[], active=null, busy=false, apiReady=false;
let liveEnabled=false, pending=null, editing=null;
const demo = {id:"demo", title:"Guided chat preview", messages:[{q:"I have a headache."}]};
const dialog=$("dialog");
function node(tag,txt,cls){const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;}
function button(text,fn,cls="alt"){const b=node("button",text,cls);b.type="button";b.onclick=fn;return b;}
function link(){const a=node("a","NCCIH · Ginger ↗");a.href=source;a.target="_blank";a.rel="noopener";return a;}
function showDialog(title){$("dialogTitle").textContent=title;$("dialogBody").replaceChildren();if(!dialog.open)dialog.showModal();return $("dialogBody");}
$("close").onclick=()=>dialog.close();
function closeNav(){document.body.classList.remove("open");}
$("menu").onclick=()=>document.body.classList.add("open");$("shade").onclick=closeNav;
async function api(route,data,signal){const r=await fetch("/api/"+route,{signal,method:data?"POST":"GET",headers:data?{"Content-Type":"application/json"}:{},body:data?JSON.stringify(data):undefined});const j=await r.json();if(!r.ok)throw Error(j.error||"Request failed.");return j;}
function syncGuest(){try{sessionStorage.setItem("biosentry-guest",JSON.stringify(guest));}catch{}}
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
    heading:"Botanical name",
    short:"The botanical name of ginger is Zingiber officinale.",
    detail:"This Latin name identifies the plant across different common names, including ginger and adrak.",
    excerpt:"Latin Names: Zingiber officinale"
  },
  part: {
    heading:"Plant part used in food",
    short:"The part of ginger used in food is its rhizome, a stem that grows underground.",
    detail:"A rhizome is an underground stem. It is the knobbly part you typically see sold as fresh ginger.",
    excerpt:"Its rhizome (underground stem) is used in food and for health purposes."
  }
};

function activeChat() {
  return active === "demo" ? demo : chats.find(chat => chat.id === active);
}

function titleFor(chat) {
  return chat.title || chat.messages[0].q;
}

function resolveQuestion(raw, previous = "") {
  const question = raw.toLowerCase().replaceAll("’", "'").trim();
  const ginger = /ginger|adrak|अदरक/.test(question);
  const headache = /\bheadaches?\b|\bhead (?:hurts|pain)\b|\b(?:sar|sir)\b.{0,16}\bdard\b|सिर.{0,16}दर्द/.test(question);
  const personal = /\b(?:my|i have|i've had|i keep getting|i am (?:having|getting)|i'm (?:having|getting)|i get|i got|i feel|i've been (?:having|getting)|i (?:sometimes|often) get|my child|mujhe|mera|mere)\b|मुझे|मेरा|मेरे/.test(question);
  const onset = /\bsudden(?:ly)?\b|out of nowhere|achanak|अचानक/.test(question);
  const gradual = /gradual|built up|slowly|dheere|धीरे/.test(question);
  const extreme = /(?:very|extremely|unbearably) (?:painful|severe)|\bsevere headaches?\b|\b(?:worst|unbearable)\b|bahut tez|बहुत तेज/.test(question);
  const duration = /\btoday|yesterday|(\d+|one|two|three|few|several|a few|a) (?:hours?|days?|weeks?|months?)|keep(?:s)? (?:coming back|getting)|since|aaj|kal se|आज|कल से/.test(question);
  const danger = /slurred speech|difficulty speaking|can.t speak|weakness on one side|lost vision|loss of vision|head injury|very high fever.{0,30}stiff neck/.test(question);

  if (previous === "headache-severity" && extreme) return "headache-urgent";
  if (headache && personal) {
    if (danger || (onset && extreme)) return "headache-urgent";
    if (onset) return /\b(?:mild|moderate)\b/.test(question) ? "headache-sudden" : "headache-severity";
    if (gradual && !duration) return "headache-duration";
    return duration ? "headache-info" : "headache-onset";
  }

  // A fresh reference question takes precedence over an open intake question.
  if (/source|citation|evidence|reference|jaankari kahan/.test(question)) return "source";
  const healthRequest = /cure|dose|pain|treat|symptom|dard|दर्द|ilaj|इलाज/.test(question);
  if ((ginger && !healthRequest) || previous === "followup") {
    if (/\bboth\b|dono|दोनों/.test(question)) return "both";
    if (/botanic|name|naam|नाम|scientific/.test(question)) return "name";
    if (/part|rhizome|root|food|hissa|हिस्सा/.test(question)) return "part";
    if (ginger) return "both";
  }
  if (headache && previous in followUps && danger) return "headache-urgent";
  if (/^(?:what|why|how|define|tell me about)\b/.test(question)) {
    return headache ? "headache-info" : "outside";
  }

  if (previous in followUps) {
    if (danger || (onset && extreme)) return "headache-urgent";
    if (previous === "headache-onset" && onset) return "headache-severity";
    if (previous === "headache-onset" && gradual && !duration) return "headache-duration";
    return previous === "headache-severity" ? "headache-sudden" : "headache-info";
  }
  return headache ? "headache-info" : "outside";
}

function storedTopic(message, previous) {
  if (message.card === "followup") return resolveQuestion(message.q, previous);
  return message.card || resolveQuestion(message.q, previous);
}

function getCardKeys(topic) {
  if (topic === "both" || topic === "source") return ["name", "part"];
  if (topic === "name" || topic === "part") return [topic];
  return [];
}

function showSources(keys) {
  const body = $("sourceBody");
  body.replaceChildren();
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
$("closeSource").onclick = () => $("sourceDrawer").close();

function setAnswerStatus(text) {
  $("workStatus").textContent = text;
  $("workStatus").hidden = !text;
  $("composeMode").hidden = Boolean(text);
  $("stopAnswer").hidden = !pending;
  $("send").hidden = Boolean(pending);
}
function stopAnswer() {
  pending?.abort();
  pending = null;
  setAnswerStatus("");
}
$("stopAnswer").onclick = stopAnswer;

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

function showEditMode() {
  const isEditing = Boolean(editing);
  $("editBanner").hidden = !isEditing;
  $("composer").classList.toggle("editing", isEditing);
  $("send").textContent = isEditing ? "Save" : "↑";
  $("send").setAttribute("aria-label", isEditing ? "Save edited message" : "Send message");
}

function editMessage(message) {
  if (busy || pending) return;
  if (!editing) editing = {draft:$("prompt").value};
  $("prompt").value = message.q;
  $("notice").textContent = "";
  showEditMode();
  $("prompt").focus();
  $("prompt").setSelectionRange(message.q.length, message.q.length);
}

function cancelEdit() {
  if (!editing || busy) return;
  stopAnswer();
  $("prompt").value = editing.draft;
  editing = null;
  showEditMode();
}
$("cancelEdit").onclick = () => {
  cancelEdit();
  $("prompt").focus();
};

function shareReply(text) {
  const content = showDialog("Share answer");
  const preview = node("textarea");
  preview.value = text;
  preview.readOnly = true;
  preview.rows = 6;
  preview.className = "sharePreview";
  preview.setAttribute("aria-label","Answer to share");
  const status = node("p");
  status.setAttribute("role","status");
  const copy = button("Copy answer", async () => {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Answer copied.";
    } catch {
      preview.focus();
      preview.select();
      status.textContent = "Select Copy in your browser to copy the answer.";
    }
  }, "action");
  content.append(preview, copy);
  if (typeof navigator.share === "function") {
    content.append(button("Share via…", async () => {
      try {
        await navigator.share({title:"BioSentry AI", text});
      } catch (err) {
        if (err.name !== "AbortError") status.textContent = "Sharing is unavailable. You can copy the answer.";
      }
    }));
  }
  content.append(status);
}

function replyActions(chat, message, index, summary, sourceUrl) {
  const shareText = [summary, sourceUrl].filter(Boolean).join("\n\n");
  const actions = node("div", undefined, "replyActions");
  actions.append(button("Copy", async event => {
    const copy = event.currentTarget;
    try {
      await navigator.clipboard.writeText(shareText);
      copy.textContent = "Copied";
    } catch {
      shareReply(shareText);
    }
  }, "textAction"));
  actions.append(button("Share", () => shareReply(shareText), "textAction"));
  for (const feedback of ["Helpful", "Unclear"]) {
    const option = button(feedback, async () => {
      if (busy || pending) return;
      const current = activeChat();
      if (!current || current.id !== chat.id) return;
      const selected = current.messages[index]?.feedback === feedback ? undefined : feedback;
      const messages = current.messages.map((item, i) => i === index ? {...item, feedback:selected} : item);
      busy = true;
      try {
        await saveChat({...current, messages});
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

function renderReply(chat, message, index, topic) {
  const reply = node("div", undefined, "reply");
  reply.append(node("strong","BioSentry AI"));
  const last = index === chat.messages.length - 1;

  const followUp = followUps[topic];
  if (followUp) {
    const panel = node("section", undefined, "followUp");
    const row = node("div", undefined, "understood");
    row.append(node("span","You’re asking about a headache."));
    panel.append(row, node("h2",followUp.prompt));
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
  if (topic.startsWith("headache-")) {
    const text = {
      "headache-urgent":"These symptoms can need emergency care. Call your local emergency number or go to the nearest emergency department now.",
      "headache-sudden":"A sudden headache that is extremely painful needs emergency care. If this headache is new or unusual for you, contact a healthcare professional promptly.",
      "headache-info":"Headaches have many possible causes. Rest, water and regular meals may help. If yours keeps coming back or is getting worse, speak with a healthcare professional. Seek emergency care for a headache that starts suddenly and is extremely painful."
    }[topic];
    reply.append(node("p", text, "answerSummary"));
    const reference = node("a","NHS · Headaches ↗");
    reference.href = headacheSource;
    reference.target = "_blank";
    reference.rel = "noopener";
    reply.append(reference, replyActions(chat, message, index, text, headacheSource));
    return reply;
  }
  const keys = getCardKeys(topic);
  if (!keys.length) {
    const summary = "This preview covers ginger’s botanical name and the plant part used in food. Ask about one of those topics to try it.";
    reply.append(node("p", summary), replyActions(chat, message, index, summary));
    return reply;
  }
  const useHinglish = /adrak|अदरक|\bkya\b|\bkaun/.test(message.q.toLowerCase());
  const hindi = {
    name: "Adrak ka botanical naam Zingiber officinale hai.",
    part: "Adrak ka khane mein istemal hone wala hissa rhizome hai, jo zameen ke neeche ugne wala tana hai."
  };
  const summary = topic === "source"
    ? "This ginger reference comes from the National Center for Complementary and Integrative Health."
    : keys.map(key => useHinglish ? hindi[key] : cards[key].short).join(" ");
  reply.append(node("p", summary, "answerSummary"));
  const details = node("details", undefined, "answerDetails");
  details.append(node("summary","Show details"));
  for (const key of keys) details.append(node("p", cards[key].detail));
  reply.append(details);
  const actions = replyActions(chat, message, index, summary, source);
  actions.prepend(button("NCCIH · Ginger ↗", () => showSources(keys), "citation"));
  reply.append(actions);
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
  $("composeMode").lastChild.textContent = liveEnabled ? " MedGemma reference mode" : " Reference library";

  const history = $("history");
  history.replaceChildren();
  if (!chats.length) history.append(node("p","Your chats will appear here.","empty"));
  for (const item of chats) {
    const row = node("div", undefined, item.id === active ? "historyRow activeChat" : "historyRow");
    const open = button(titleFor(item), () => navigate(item.id), "historyTitle");
    open.title = titleFor(item);
    if (item.id === active) open.setAttribute("aria-current","page");
    const menu = button("⋯", () => chatMenu(item), "historyMenu");
    menu.setAttribute("aria-label", "Actions for " + titleFor(item));
    row.append(open, menu);
    history.append(row);
  }

  const messages = $("messages");
  messages.replaceChildren();
  $("prompt").placeholder = "Ask BioSentry a question…";
  if (!chat) return;
  if (chat.id === "demo") messages.append(node("p","Example conversation","demoLabel"));
  let previous = "";
  chat.messages.forEach((message, index) => {
    const topic = storedTopic(message, previous);
    const userTurn = node("div", undefined, "userTurn");
    const bubble = node("div", message.q, "userMsg");
    userTurn.append(bubble);
    if (index === chat.messages.length - 1) {
      const edit = button("Edit", () => {
        userTurn.classList.remove("showEdit");
        editMessage(message);
      }, "textAction editMessage");
      edit.setAttribute("aria-label","Edit latest message");
      bubble.addEventListener("click", event => {
        if (event.pointerType === "touch" || event.pointerType === "pen") {
          userTurn.classList.toggle("showEdit");
        }
      });
      userTurn.append(edit);
    }
    messages.append(userTurn, renderReply(chat,message,index,topic));
    previous = message.card === "followup" ? "followup" : topic;
  });
  if (previous in followUps) $("prompt").placeholder = "Choose an option or type your answer…";
}

document.addEventListener("pointerdown", event => {
  const revealed = $("messages").querySelector(".showEdit");
  if (revealed && !revealed.contains(event.target)) revealed.classList.remove("showEdit");
});

function route() {
  if (location.hash === "#demo") return "demo";
  return location.hash.startsWith("#chat/") ? location.hash.slice(6) : null;
}
function navigate(id, focus=true) {
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

async function submitQuestion(question) {
  const q = question.trim();
  if (!q || q.length > 1500 || busy || pending) return;
  if (editing && q === activeChat()?.messages.at(-1)?.q) {
    cancelEdit();
    return;
  }
  const origin = active;
  const current = activeChat();
  const messages = current?.messages.slice() || [];
  if (editing) messages.pop();
  const last = messages.at(-1);
  const previous = last?.card || (last ? resolveQuestion(last.q) : "");
  let topic = resolveQuestion(q, previous);
  const request = new AbortController();
  pending = request;
  $("notice").textContent = "";
  setAnswerStatus("Checking sources…");
  try {
    if (liveEnabled && (topic === "name" || topic === "part")) {
      setAnswerStatus("Preparing answer…");
      const result = await api("answer", {topic}, request.signal);
      topic = result.card;
    }
    if (request.signal.aborted) return;
    pending = null;
    busy = true;
    setAnswerStatus("");
    $("send").disabled = true;
    const updated = {...current, id:current?.id || crypto.randomUUID(), messages:[...messages,{q,card:topic}]};
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
$("prompt").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();$("composer").requestSubmit();}};
document.querySelectorAll("[data-question]").forEach(b=>b.onclick=()=>{$("prompt").value=b.dataset.question;$("composer").requestSubmit();});
function openLibrary() {
  closeNav();
  const d = showDialog("Classical Ayurveda Source Library");
  const intro = node("p", "Search authentic classical treatises (Charaka, Sushruta, Ayurvedic Pharmacopoeia of India, AFI). Direct link opens the exact local PDF page.");
  
  const statsBar = node("div", "Loading corpus statistics...", "libStats");
  fetch("/api/library/stats").then(r => r.json()).then(st => {
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

  const reviewViewerLink = node("a", "Open Pilot Review Viewer (चरक, सुश्रुत & API पन्ने) ↗", "libReviewLink");
  reviewViewerLink.href = "/library/review";
  reviewViewerLink.target = "_blank";
  reviewViewerLink.style.cssText = "display:inline-block;margin-bottom:12px;font-size:12px;font-weight:600;color:var(--leaf);";

  const list = node("div", undefined, "libList");

  async function doSearch(query) {
    const q = (query !== undefined ? query : inp.value).trim();
    if (!q) return;
    list.replaceChildren(node("p", `Searching for "${q}" across classical volumes...`));
    try {
      const res = await fetch("/api/library/search?q=" + encodeURIComponent(q));
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
          const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          highlighted = highlighted.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>');
        }
        snip.innerHTML = highlighted;

        const disclaimer = node("div", "Historical classical formulation for research & exhibition. Not personal medical advice or automated prescription.", "libDisclaimer");

        const actions = node("div", undefined, "libActions");
        const pdfLink = node("a", "View Original Page (मूल पन्ना देखें) ↗", "libBtn");
        pdfLink.href = `/api/library/pdf?book_id=${encodeURIComponent(r.book_id)}#page=${r.page_no}`;
        pdfLink.target = "_blank";
        pdfLink.rel = "noopener";
        actions.append(pdfLink);

        card.append(head, meta, snip, disclaimer, actions);
        list.append(card);
      }
    } catch (err) {
      list.replaceChildren(node("p", "Search failed: " + err.message));
    }
  }

  btn.onclick = () => doSearch();
  inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } };

  d.append(intro, statsBar, searchBox, pills, reviewViewerLink, list);
  inp.value = "Guduchi";
  doSearch("Guduchi");
}
$("library").onclick = openLibrary;
$("search").onclick=()=>{closeNav();const d=showDialog("Search chats");const i=node("input");i.placeholder="Search your conversations";i.setAttribute("aria-label","Search conversations");const list=node("div");const draw=()=>{list.replaceChildren();const results=chats.filter(c=>titleFor(c).toLowerCase().includes(i.value.toLowerCase())||c.messages.some(m=>m.q.toLowerCase().includes(i.value.toLowerCase())));if(!results.length)list.append(node("p","No matching conversations."));for(const c of results)list.append(button(titleFor(c),()=>{dialog.close();navigate(c.id);},"result"));};i.oninput=draw;d.append(i,list);draw();i.focus();};
function auth(signup=false){closeNav();const d=showDialog(email?"Your account":signup?"Create your account":"Welcome back");
if(email){d.append(node("p",email),button("Sign out",async()=>{try{await api("logout",{});stopAnswer();email=null;guest=[];syncGuest();chats=[];dialog.close();navigate(null);}catch(e){d.append(node("p",e.message));}}));return;}
d.append(node("p",signup?"Create an account to save and revisit conversations on this server.":"Sign in to open your saved conversations."));
if(!apiReady){d.append(node("p","Account access requires the BioSentry web server. Guest chat is available."));return;}
const f=node("form");function field(title,type,complete){const l=node("label",title),i=node("input");i.type=type;i.autocomplete=complete;i.required=true;l.append(i);f.append(l);return i;}const mail=field("Email","email","email"),pw=field(signup?"Password · 10 characters minimum":"Password","password",signup?"new-password":"current-password");pw.minLength=10;const submit=node("button",signup?"Create account":"Sign in","action");const error=node("p","","err");error.setAttribute("role","alert");f.append(submit,error);f.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await api(signup?"signup":"login",{email:mail.value,password:pw.value});const st=await api("state");email=st.email;chats=st.chats;guest=[];syncGuest();dialog.close();navigate(null);}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}};d.append(f,button(signup?"Already registered? Sign in":"Create an account",()=>auth(!signup)));mail.focus();}
$("profile").onclick=$("headerAccount").onclick=()=>auth();
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
  const label = node("label","Conversation name");
  const input = node("input");
  const error = node("p","","err");
  error.setAttribute("role","alert");
  input.value = titleFor(chat).slice(0,80);
  input.required = true;
  input.maxLength = 80;
  label.append(input);
  const submit = node("button","Save name","action");
  form.append(label,submit,error);
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || pending || !input.value.trim()) return;
    submit.disabled = true;
    try {
      await saveChat({...chat,title:input.value.trim()});
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
function artwork(el){const w=el.width,h=el.height,d=devicePixelRatio||1;el.style.width=w+"px";el.style.height=h+"px";el.width=w*d;el.height=h*d;const c=el.getContext("2d");c.scale(d,d);const kind=el.dataset.art;c.strokeStyle=kind==="mark"?"#dfdfab":"#5b7350";c.lineWidth=1.25;c.lineCap="round";
function line(x,y,X,Y){c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.stroke();}
function leaf(x,y,angle,len,width){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(width,-len*.45,0,-len);c.quadraticCurveTo(-width,-len*.48,0,0);c.fillStyle=kind==="mark"?"#90af83":"#d4dfbf";c.fill();c.stroke();line(0,0,0,-len);for(let j=2;j<8;j++){let t=j/10,hw=width*(1-Math.abs(t-.5)*1.5)*.44;line(0,-len*t,hw,-len*(t+.1));line(0,-len*t,-hw,-len*(t+.1));}c.restore();}
function sprig(x,y,a,len){c.save();c.translate(x,y);c.rotate(a);line(0,0,0,-len);for(let i=1;i<=3;i++){let yy=-len*i/4;leaf(0,yy,-.95,len*(.39-i*.025),len*.12);leaf(0,yy-3,.8,len*(.41-i*.025),len*.12);}leaf(0,-len*.85,.06,len*.34,len*.1);c.restore();}
if(kind==="hero"){c.fillStyle="#eef0de";c.beginPath();c.ellipse(56,48,37,36,-.16,0,7);c.fill();sprig(50,84,-.46,49);sprig(47,83,.35,68);sprig(58,76,.93,36);}
else if(kind==="root"){c.strokeStyle="#a3814d";c.fillStyle="#dbbb85";c.beginPath();c.moveTo(6,28);c.bezierCurveTo(2,17,14,26,17,17);c.bezierCurveTo(13,7,21,5,23,13);c.bezierCurveTo(25,21,28,13,33,9);c.bezierCurveTo(41,6,44,14,36,18);c.bezierCurveTo(28,21,38,25,34,30);c.bezierCurveTo(29,35,27,26,22,27);c.bezierCurveTo(14,32,9,34,6,28);c.fill();c.stroke();for(let i=0;i<4;i++)line(11+i*3,23-i,13+i*3,28-i);}
else if(kind==="book"){c.strokeStyle="#627c76";for(let j=0;j<2;j++){c.save();c.translate(23,11);c.scale(j?-1:1,1);c.strokeRect(0,0,17,20);for(let i=1;i<=3;i++)line(4,i*5,13,i*5);c.restore();}}
else sprig(w*.43,h*.93,.24,h*.64);}
document.querySelectorAll("canvas[data-art]").forEach(artwork);
const icons={search:"⌕",book:"▤"};document.querySelectorAll("[data-icon]").forEach(n=>{n.textContent=icons[n.dataset.icon];n.style.font="20px/1 Georgia";});
(async()=>{try{guest=JSON.parse(sessionStorage.getItem("biosentry-guest")||"[]");}catch{}try{const st=await api("state");email=st.email;liveEnabled=!!st.liveEnabled;apiReady=true;chats=email?st.chats:guest;}catch{chats=guest;}active=route();render();})();
