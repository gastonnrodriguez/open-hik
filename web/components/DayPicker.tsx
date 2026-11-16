"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Selected day, YYYY-MM-DD. */
  value: string;
  /** Last selectable day (today), YYYY-MM-DD. */
  max: string;
  /** Camera whose recordings mark the calendar. */
  channel: number;
  onChange: (date: string) => void;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Date field with a month calendar that marks the days the DVR has footage
 * for, so nobody has to guess which days are still on the disk.
 */
export default function DayPicker({ value, max, channel, onChange }: Props) {
  const [open, setOpen] = useState(false);
  /** Month on show, "YYYY-MM". */
  const [month, setMonth] = useState(value.slice(0, 7));
  /** Recorded days per "channel|YYYY-MM"; a missing key means not loaded (or failed). */
  const [recorded, setRecorded] = useState<Record<string, number[]>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const key = `${channel}|${month}`;
  const days = recorded[key];

  useEffect(() => {
    if (open) setMonth(value.slice(0, 7));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // always refetch on open: the server caches, and today's month keeps changing
    fetch(`/api/calendar?channel=${channel}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.days) setRecorded((cur) => ({ ...cur, [`${channel}|${month}`]: d.days }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, channel, month]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  /** Monday-first column of the 1st. */
  const lead = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  const label = `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1].slice(0, 3)} ${value.slice(0, 4)}`;

  return (
    <div className="daypicker" ref={rootRef}>
      <button
        type="button"
        className="daypicker-field"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Date: ${label}`}
        title="Pick a day"
      >
        {label}
      </button>
      {open && (
        <div className="daypicker-pop" role="dialog" aria-label="Pick a day">
          <div className="daypicker-head">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <span>
              {MONTHS[mon - 1]} {year}
            </span>
            <button type="button" onClick={() => shiftMonth(1)} disabled={month >= max.slice(0, 7)} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="daypicker-grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="daypicker-wd">
                {w}
              </span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const n = i + 1;
              const iso = `${month}-${pad(n)}`;
              const has = days ? days.includes(n) : null;
              const cls = ["daypicker-day"];
              if (has) cls.push("rec");
              if (iso === value) cls.push("selected");
              if (iso === max) cls.push("today");
              return (
                <button
                  key={n}
                  type="button"
                  className={cls.join(" ")}
                  // until the DVR answers (or if it can't), every past day stays selectable
                  disabled={iso > max || has === false}
                  title={has === false ? "No recordings" : has ? "Has recordings" : undefined}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="daypicker-foot">
            <span className="daypicker-key" /> {days ? "recorded" : "reading the DVR…"}
            <button
              type="button"
              onClick={() => {
                onChange(max);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
