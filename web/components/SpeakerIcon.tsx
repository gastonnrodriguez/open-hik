/** Speaker glyph shared by the live tiles and the playback bar. */
export default function SpeakerIcon({ muted, size = 14 }: { muted: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
      {muted ? (
        <path d="M10.5 6l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      ) : (
        <path
          d="M10.3 5.8a3.2 3.2 0 010 4.4M12 4a5.6 5.6 0 010 8"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}
