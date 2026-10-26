"use client";

import { type Practice, practices } from "@jesus-in-practice/content";
import { ArrowLeftIcon, CheckIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useState } from "react";

import { persistenceMessage, useCurrentDate, useDemo } from "@/components/demo-provider";
import { usePracticeCatalog } from "@/components/practice-catalog";
import PracticeLesson from "@/components/practice-lesson";
import { PracticeCard, SaveButton, Status } from "@/components/ui";
import { dateInTimezone, toggleCompletion } from "@/lib/demo-model";
import { memberError } from "@/lib/member-api";

export default function PracticeView({ practice }: { practice: Practice }) {
  const { state, update, pending, mode } = useDemo();
  const catalog = usePracticeCatalog({ source: practice.source, limit: 3 }, mode === "live");
  const now = useCurrentDate();
  const [draft, setDraft] = useState<{ value: string; baseline: string } | null>(null);
  const [noteError, setNoteError] = useState(false);
  const savedNote = state.notes[practice.id] || "";
  const note = draft?.value ?? savedNote;
  const [noteStatus, setNoteStatus] = useState("");
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const date = dateInTimezone(now, state.timezone);
  const completed = state.completed.some(
    (entry) => entry.id === practice.id && entry.date === date,
  );
  const related = (mode === "live" ? (catalog.page?.items ?? []) : practices)
    .filter((item) => item.id !== practice.id && item.source === practice.source)
    .slice(0, 2);
  const dirty = note !== savedNote;
  const conflict = draft !== null && draft.baseline !== savedNote && dirty;
  async function saveNote(replaceNewer = false) {
    const value = note.trim();
    let changedElsewhere = false;
    try {
      const outcome = await update((current) => {
        const latest = current.notes[practice.id] || "";
        if (!replaceNewer && latest !== (draft?.baseline ?? savedNote) && latest !== value) {
          changedElsewhere = true;
          return current;
        }
        const notes = { ...current.notes };
        if (value) notes[practice.id] = value;
        else delete notes[practice.id];
        return { ...current, notes };
      });
      if (changedElsewhere) {
        setNoteError(true);
        setNoteStatus(
          "This reflection changed in another tab. Choose which version to keep below.",
        );
        return;
      }
      setDraft(null);
      setNoteError(false);
      setNoteStatus(
        persistenceMessage(
          outcome,
          value ? "Reflection saved in this browser." : "Reflection removed from this browser.",
        ),
      );
    } catch (error) {
      setNoteError(true);
      setNoteStatus(memberError(error));
    }
  }
  return (
    <>
      <Link className="back-link" href="/library">
        <ArrowLeftIcon aria-hidden="true" />
        Back to the library
      </Link>
      <div className="practice-detail-layout">
        <article className="practice-detail">
          <div className="card-topline">
            <span className="tag">{practice.category}</span>
            <span className="small muted">About {practice.minutes} minutes to practice</span>
          </div>
          <h1>{practice.title}</h1>
          <PracticeLesson practice={practice} headingLevel="h2" />
          <section className="detail-action" aria-label="Record your practice">
            <div className="button-row">
              <button
                className={`button ${completed ? "button-completed" : "button-primary"}`}
                aria-pressed={completed}
                disabled={pending}
                onClick={async () => {
                  setFailed(false);
                  try {
                    const outcome = await update((current) =>
                      toggleCompletion(current, practice.id, date),
                    );
                    setStatus(
                      persistenceMessage(
                        outcome,
                        completed
                          ? "Removed from today’s completed practices."
                          : "Added to your journey for today.",
                      ),
                    );
                  } catch (error) {
                    setFailed(true);
                    setStatus(memberError(error));
                  }
                }}
              >
                <CheckIcon aria-hidden="true" />
                {completed ? "Practiced today" : "I practiced this"}
              </button>
              <SaveButton id={practice.id} />
            </div>
            <Status error={failed}>{status}</Status>
          </section>
          <section className="reflection-section">
            <span className="eyebrow">WHAT DID YOU NOTICE?</span>
            <h2>{practice.reflection}</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                saveNote();
              }}
            >
              <label htmlFor="reflection">
                Your reflection <span className="muted">(optional)</span>
              </label>
              <textarea
                id="reflection"
                rows={5}
                maxLength={1500}
                value={note}
                disabled={pending}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft(
                    value === savedNote ? null : { value, baseline: draft?.baseline ?? savedNote },
                  );
                  setNoteStatus("");
                  setNoteError(false);
                }}
                aria-describedby={
                  conflict ? "reflection-privacy reflection-conflict" : "reflection-privacy"
                }
                placeholder="What did you notice? What might you try next time?"
              />
              <div className="field-meta">
                <p id="reflection-privacy">
                  {mode === "live"
                    ? "Saving stores this optional reflection in your account. It is not included in reminders. Avoid unnecessary sensitive details."
                    : "Saved only in this browser, accessible to anyone using this browser profile. Avoid private or sensitive details."}
                </p>
                <span>{note.length}/1500</span>
              </div>
              <div className="button-row">
                <button
                  className="button button-primary"
                  disabled={!dirty || conflict || pending}
                  type="submit"
                >
                  Save reflection
                </button>
                {dirty && (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setDraft(null);
                      setNoteStatus("");
                      setNoteError(false);
                    }}
                  >
                    Cancel changes
                  </button>
                )}
                <span className="small muted">{dirty ? "Unsaved changes" : ""}</span>
              </div>
              {conflict && (
                <div className="info-box" id="reflection-conflict">
                  <p role="status">
                    This reflection changed in another tab. Your draft has not been saved. Load the
                    newer reflection, or explicitly replace it with your draft.
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={pending}
                      className="button button-secondary"
                      onClick={() => {
                        setDraft(null);
                        setNoteStatus("Newer reflection loaded. Your draft was discarded.");
                        setNoteError(false);
                      }}
                    >
                      Load newer reflection
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="button button-danger"
                      onClick={() => saveNote(true)}
                    >
                      Replace saved reflection with my draft
                    </button>
                  </div>
                </div>
              )}
              <Status error={noteError}>{noteStatus}</Status>
            </form>
          </section>
        </article>
        <aside className="detail-rail">
          <section className="panel">
            <h2>Make it your own</h2>
            <p>
              A practice is an invitation. Adapt it to your capacity, circumstances, and safety.
            </p>
            <p className="small muted">
              You can keep boundaries, take a smaller step, or choose a different practice.
            </p>
            <Link className="text-link" href="/library">
              Explore something else
            </Link>
          </section>
          <h2 className="small-heading">More from this source</h2>
          {related.map((item) => (
            <PracticeCard key={item.id} practice={item} />
          ))}
        </aside>
      </div>
    </>
  );
}
