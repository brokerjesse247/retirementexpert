"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { formatDate, responseMessage } from "./api";

type AdvisorNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  archivedAt: string | null;
};

type AdvisorTask = {
  id: string;
  title: string;
  details: string;
  owner: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

type TaskDraft = { title: string; details: string; owner: string; dueAt: string };
type NotesResponse = { notes?: AdvisorNote[]; csrfToken?: string };
type TasksResponse = { tasks?: AdvisorTask[]; csrfToken?: string };

const emptyTask: TaskDraft = { title: "", details: "", owner: "", dueAt: "" };

function taskDraft(task: AdvisorTask): TaskDraft {
  return { title: task.title, details: task.details, owner: task.owner, dueAt: task.dueAt?.slice(0, 10) ?? "" };
}

function dueLabel(value: string | null) {
  return value ? formatDate(value) : "No due date";
}

function isOverdue(task: AdvisorTask, todayUtc: number) {
  if (task.completedAt || !task.dueAt) return false;
  const due = new Date(task.dueAt);
  return Number.isFinite(due.valueOf()) && due.valueOf() < todayUtc;
}

export function NotesTasksWorkspace({ clientId }: { clientId: string }) {
  const [notes, setNotes] = useState<AdvisorNote[]>([]);
  const [tasks, setTasks] = useState<AdvisorTask[]>([]);
  const [csrfToken, setCsrfToken] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editingNote, setEditingNote] = useState<AdvisorNote | null>(null);
  const [taskForm, setTaskForm] = useState<TaskDraft>(emptyTask);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEdits, setTaskEdits] = useState<Record<string, TaskDraft>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function clearFeedback() {
    setError("");
    setNotice("");
  }

  function replaceNote(next: AdvisorNote) {
    setNotes((current) => current.map((note) => note.id === next.id ? next : note));
  }

  function replaceTask(next: AdvisorTask) {
    setTasks((current) => current.map((task) => task.id === next.id ? next : task));
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const encodedId = encodeURIComponent(clientId);
      const [notesResponse, tasksResponse] = await Promise.all([
        fetch(`/api/clients/${encodedId}/notes`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/clients/${encodedId}/tasks`, { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (notesResponse.status === 404 || tasksResponse.status === 404) throw new Error("This client record is not available to your account.");
      if (!notesResponse.ok) throw new Error(await responseMessage(notesResponse, "Private notes are unavailable."));
      if (!tasksResponse.ok) throw new Error(await responseMessage(tasksResponse, "Follow-up tasks are unavailable."));
      const noteBody = await notesResponse.json() as NotesResponse;
      const taskBody = await tasksResponse.json() as TasksResponse;
      if (!noteBody.csrfToken || noteBody.csrfToken !== taskBody.csrfToken) throw new Error("Your secure session needs to be refreshed before editing records.");
      setNotes(Array.isArray(noteBody.notes) ? noteBody.notes : []);
      setTasks(Array.isArray(taskBody.tasks) ? taskBody.tasks : []);
      setCsrfToken(noteBody.csrfToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Advisor records are unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [clientId]);

  async function createNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setWorking("create-note");
    clearFeedback();
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody, csrfToken }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The note could not be saved."));
      const body = await response.json() as { note?: AdvisorNote; csrfToken?: string };
      if (!body.note) throw new Error("The server did not confirm the note.");
      setNotes((current) => [body.note!, ...current]);
      setCsrfToken(body.csrfToken || csrfToken);
      setNoteBody("");
      setNotice("Private note saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note could not be saved.");
    } finally {
      setWorking(null);
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !editingNote) return;
    setWorking(`note-${editingNote.id}`);
    clearFeedback();
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes/${encodeURIComponent(editingNote.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody, revision: editingNote.revision, csrfToken }),
      });
      if (response.status === 409) throw new Error("This note changed elsewhere. Reload before editing it.");
      if (!response.ok) throw new Error(await responseMessage(response, "The note could not be updated."));
      const body = await response.json() as { note?: AdvisorNote; csrfToken?: string };
      if (!body.note) throw new Error("The server did not confirm the note update.");
      replaceNote(body.note);
      setCsrfToken(body.csrfToken || csrfToken);
      setEditingNote(null);
      setNoteBody("");
      setNotice("Private note updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note could not be updated.");
    } finally {
      setWorking(null);
    }
  }

  async function archiveNote(note: AdvisorNote) {
    if (!csrfToken) return;
    setWorking(`archive-note-${note.id}`);
    clearFeedback();
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes/${encodeURIComponent(note.id)}`, {
        method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: note.revision, csrfToken }),
      });
      if (response.status === 409) throw new Error("This note changed elsewhere. Reload before archiving it.");
      if (!response.ok) throw new Error(await responseMessage(response, "The note could not be archived."));
      const body = await response.json() as { csrfToken?: string };
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setCsrfToken(body.csrfToken || csrfToken);
      if (editingNote?.id === note.id) { setEditingNote(null); setNoteBody(""); }
      setNotice("Note archived. Existing report snapshots were not changed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note could not be archived.");
    } finally {
      setWorking(null);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setWorking("create-task");
    clearFeedback();
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/tasks`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...taskForm, dueAt: taskForm.dueAt || null, csrfToken }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "The follow-up task could not be saved."));
      const body = await response.json() as { task?: AdvisorTask; csrfToken?: string };
      if (!body.task) throw new Error("The server did not confirm the follow-up task.");
      setTasks((current) => [body.task!, ...current]);
      setCsrfToken(body.csrfToken || csrfToken);
      setTaskForm(emptyTask);
      setNotice("Follow-up task saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The follow-up task could not be saved.");
    } finally {
      setWorking(null);
    }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>, task: AdvisorTask) {
    event.preventDefault();
    if (!csrfToken) return;
    const draft = taskEdits[task.id];
    if (!draft) return;
    setWorking(`task-${task.id}`);
    clearFeedback();
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, dueAt: draft.dueAt || null, revision: task.revision, csrfToken }),
      });
      if (response.status === 409) throw new Error("This task changed elsewhere. Reload before editing it.");
      if (!response.ok) throw new Error(await responseMessage(response, "The task could not be updated."));
      const body = await response.json() as { task?: AdvisorTask; csrfToken?: string };
      if (!body.task) throw new Error("The server did not confirm the task update.");
      replaceTask(body.task);
      setCsrfToken(body.csrfToken || csrfToken);
      setEditingTaskId(null);
      setNotice("Follow-up task updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task could not be updated.");
    } finally {
      setWorking(null);
    }
  }

  async function transitionTask(task: AdvisorTask, action: "complete" | "reopen") {
    if (!csrfToken) return;
    setWorking(`state-${task.id}`);
    clearFeedback();
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: task.revision, csrfToken }),
      });
      if (response.status === 409) throw new Error("This task changed elsewhere. Reload before changing its status.");
      if (!response.ok) throw new Error(await responseMessage(response, "The task status could not be updated."));
      const body = await response.json() as { task?: AdvisorTask; csrfToken?: string };
      if (!body.task) throw new Error("The server did not confirm the task status.");
      replaceTask(body.task);
      setCsrfToken(body.csrfToken || csrfToken);
      setNotice(action === "complete" ? "Task marked complete." : "Task reopened.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task status could not be updated.");
    } finally {
      setWorking(null);
    }
  }

  const taskGroups = useMemo(() => {
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const overdue = tasks.filter((task) => isOverdue(task, todayUtc));
    const open = tasks.filter((task) => !task.completedAt && !isOverdue(task, todayUtc));
    const completed = tasks.filter((task) => Boolean(task.completedAt));
    return { overdue, open, completed };
  }, [tasks]);

  function beginNoteEdit(note: AdvisorNote) {
    clearFeedback();
    setEditingNote(note);
    setNoteBody(note.body);
  }

  function beginTaskEdit(task: AdvisorTask) {
    clearFeedback();
    setEditingTaskId(task.id);
    setTaskEdits((current) => ({ ...current, [task.id]: taskDraft(task) }));
  }

  function renderTask(task: AdvisorTask) {
    const editing = editingTaskId === task.id;
    const draft = taskEdits[task.id] ?? taskDraft(task);
    const busy = working === `task-${task.id}` || working === `state-${task.id}`;
    if (editing) return <form className="card" key={task.id} onSubmit={(event) => void saveTask(event, task)}>
      <div className="field"><span>Task title</span><input className="input" value={draft.title} maxLength={240} onChange={(event) => setTaskEdits((current) => ({ ...current, [task.id]: { ...draft, title: event.target.value } }))} /></div>
      <div className="field"><span>Details</span><textarea className="input" value={draft.details} maxLength={5000} onChange={(event) => setTaskEdits((current) => ({ ...current, [task.id]: { ...draft, details: event.target.value } }))} /></div>
      <div className="two-column"><label className="field"><span>Owner</span><input className="input" value={draft.owner} maxLength={160} onChange={(event) => setTaskEdits((current) => ({ ...current, [task.id]: { ...draft, owner: event.target.value } }))} /></label><label className="field"><span>Due date</span><input className="input" type="date" value={draft.dueAt} onChange={(event) => setTaskEdits((current) => ({ ...current, [task.id]: { ...draft, dueAt: event.target.value } }))} /></label></div>
      <div className="button-row"><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save task"}</button><button className="button button-secondary" type="button" onClick={() => setEditingTaskId(null)} disabled={busy}>Cancel</button></div>
    </form>;
    return <article className="card" key={task.id}>
      <div className="workspace-header"><div><h3 className="section-title">{task.title}</h3><p className="muted">{task.owner ? `Owner: ${task.owner} · ` : ""}Due: {dueLabel(task.dueAt)}</p></div><p className="muted">Created {formatDate(task.createdAt)}</p></div>
      {task.details && <p>{task.details}</p>}
      <div className="button-row"><button className="button button-secondary" type="button" onClick={() => beginTaskEdit(task)} disabled={busy}>Edit</button><button className="button button-primary" type="button" onClick={() => void transitionTask(task, task.completedAt ? "reopen" : "complete")} disabled={busy}>{busy ? "Updating…" : task.completedAt ? "Reopen" : "Complete"}</button></div>
    </article>;
  }

  if (loading) return <section className="card"><p className="muted" aria-live="polite">Loading private notes and follow-up tasks…</p></section>;
  if (error && !csrfToken) return <section className="card"><p className="error" role="alert">{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Retry</button></section>;

  return <section className="client-detail-workspace" aria-label="Notes and follow-up tasks">
    <header className="workspace-header"><div><p className="eyebrow">Advisor records</p><h2>Notes &amp; follow-up tasks</h2><p className="muted">Private advisor-only working records. Archiving a note does not alter an immutable report snapshot.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={working !== null}>Refresh</button></header>
    {(error || notice) && <p className={error ? "error" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="card"><p className="eyebrow">Private note</p><h3 className="section-title">{editingNote ? "Edit note" : "Add note"}</h3><form onSubmit={(event) => editingNote ? void saveNote(event) : void createNote(event)}>
      <label className="field"><span>Note</span><textarea className="input" value={noteBody} maxLength={10000} required onChange={(event) => setNoteBody(event.target.value)} /></label>
      <div className="button-row"><button className="button button-primary" type="submit" disabled={working === "create-note" || (editingNote !== null && working === `note-${editingNote.id}`)}>{working === "create-note" || (editingNote !== null && working === `note-${editingNote.id}`) ? "Saving…" : editingNote ? "Save note" : "Add note"}</button>{editingNote && <button className="button button-secondary" type="button" onClick={() => { setEditingNote(null); setNoteBody(""); clearFeedback(); }}>Cancel</button>}</div>
    </form></section>

    <section><p className="eyebrow">Saved notes</p>{notes.length ? notes.map((note) => <article className="card" key={note.id}><div className="workspace-header"><p className="muted">Created {formatDate(note.createdAt)} · Updated {formatDate(note.updatedAt)}</p><div className="button-row"><button className="button button-secondary" type="button" onClick={() => beginNoteEdit(note)} disabled={working !== null}>Edit</button><button className="button button-secondary" type="button" onClick={() => void archiveNote(note)} disabled={working !== null}>{working === `archive-note-${note.id}` ? "Archiving…" : "Archive"}</button></div></div><p>{note.body}</p></article>) : <p className="muted">No active private notes yet.</p>}</section>

    <section className="card"><p className="eyebrow">Follow-up</p><h3 className="section-title">Add task</h3><form onSubmit={(event) => void createTask(event)}>
      <label className="field"><span>Task title</span><input className="input" value={taskForm.title} maxLength={240} required onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} /></label>
      <label className="field"><span>Details</span><textarea className="input" value={taskForm.details} maxLength={5000} onChange={(event) => setTaskForm((current) => ({ ...current, details: event.target.value }))} /></label>
      <div className="two-column"><label className="field"><span>Owner</span><input className="input" value={taskForm.owner} maxLength={160} onChange={(event) => setTaskForm((current) => ({ ...current, owner: event.target.value }))} /></label><label className="field"><span>Due date</span><input className="input" type="date" value={taskForm.dueAt} onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))} /></label></div>
      <button className="button button-primary" type="submit" disabled={working === "create-task"}>{working === "create-task" ? "Saving…" : "Add task"}</button>
    </form></section>

    <section><p className="eyebrow">Overdue</p>{taskGroups.overdue.length ? taskGroups.overdue.map(renderTask) : <p className="muted">No overdue tasks.</p>}</section>
    <section><p className="eyebrow">Open</p>{taskGroups.open.length ? taskGroups.open.map(renderTask) : <p className="muted">No open tasks.</p>}</section>
    <section><p className="eyebrow">Completed</p>{taskGroups.completed.length ? taskGroups.completed.map(renderTask) : <p className="muted">No completed tasks.</p>}</section>
  </section>;
}
