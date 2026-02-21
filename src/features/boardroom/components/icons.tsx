import Image from "next/image";
import { FaChessBishop, FaChessKing, FaChessKnight, FaChessPawn, FaChessRook } from "react-icons/fa";

import type { ChessPiece, NodePosition, NodeType } from "../types";
import { edgePathData } from "../utils";

export function ChessPieceGlyph({ piece }: { piece: ChessPiece }) {
  if (piece === "king") {
    return <FaChessKing />;
  }
  if (piece === "bishop") {
    return <FaChessBishop />;
  }
  if (piece === "knight") {
    return <FaChessKnight />;
  }
  if (piece === "rook") {
    return <FaChessRook />;
  }
  return <FaChessPawn />;
}

export function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function FileTextGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9.5 12h5.5M9.5 15.5h5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function EditGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M4.5 19.5h4l9.4-9.4a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4.5 15.4v4.1Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m12.6 7.4 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 7.4v5.2l3.6 2.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RefreshGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M19 6v5h-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 11a7 7 0 1 0 1.2 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function TrashGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 7V5.6c0-.4.3-.6.6-.6h4.8c.3 0 .6.2.6.6V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.8 7.8v10a1.8 1.8 0 0 0 1.8 1.8h4.8a1.8 1.8 0 0 0 1.8-1.8v-10" stroke="currentColor" strokeWidth="2" />
      <path d="M10.4 10.4v5.8M13.6 10.4v5.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8.92 3h.08a1.65 1.65 0 0 0 1-1.51V1.4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 8v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function ChevronGlyph({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BoardroomIcon() {
  return <Image src="/brand-icon.svg" alt="" width={34} height={34} priority />;
}

export function NodeGlyph({ type }: { type: NodeType }) {
  if (type === "INPUT") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4.5h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
        <path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
    );
  }
  if (type === "STRATEGY") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.2 5.3L20 10.5l-5.8 2.2L12 18l-2.2-5.3L4 10.5l5.8-2.2L12 3Z" />
      </svg>
    );
  }
  if (type === "REVIEW") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="9" r="2.3" />
        <circle cx="15.5" cy="10" r="2" />
        <path d="M5.5 17c.4-2 2-3.3 3.9-3.3h.7c1.8 0 3.4 1.3 3.8 3.3" />
        <path d="M13.2 17c.2-1.5 1.4-2.5 2.9-2.5h.5c1.4 0 2.5 1 2.8 2.5" />
      </svg>
    );
  }
  if (type === "INTERACTION") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8h10a2 2 0 0 1 2 2v4H7a2 2 0 0 1-2-2V8Z" />
        <path d="m9 14-4 4v-4" />
        <path d="M19 10V6a2 2 0 0 0-2-2H7" />
        <path d="m15 6 4-4v4" />
      </svg>
    );
  }
  if (type === "SYNTHESIS") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19.5h14" />
        <path d="M8 12v6M12 9v9M16 6v12" />
      </svg>
    );
  }
  if (type === "PRD") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12.1 4.1c2.5 1.4 4 3.9 4 6.5v.8l1.8 1.8-2 2-1.8-1.8h-.8c-2.6 0-5.1-1.5-6.5-4l5.3-5.3Z" />
        <path d="m9.2 14.8-2.9 2.9M7.1 11.5 4.4 8.8M6.3 17.7l-1.8 1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="6.5" rx="6" ry="2.5" />
      <path d="M6 6.5v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-8" />
      <path d="M6 10.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
    </svg>
  );
}

export function EdgePath({ start, end }: { start: NodePosition; end: NodePosition }) {
  return <path d={edgePathData(start, end)} className="edge-path" markerEnd="url(#workflow-arrow)" />;
}
