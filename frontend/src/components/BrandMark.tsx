import React from "react";

interface BrandMarkProps {
  className?: string;
}

/**
 * Original RepoGuru emblem: an architectural library arch framing an open book
 * and a four-point antique gold star.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = "w-8 h-8" }) => {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        fill="#171923"
        stroke="#C49A52"
        strokeWidth="1.25"
        strokeOpacity="0.55"
      />
      {/* Architectural library arch */}
      <path
        d="M9 30V18C9 11.9249 13.9249 7 20 7C26.0751 7 31 11.9249 31 18V30"
        stroke="#C49A52"
        strokeWidth="1.25"
        strokeOpacity="0.65"
      />
      {/* Open book leaves */}
      <path
        d="M12.5 27.5C15 26 17.6 26.2 20 27.8C22.4 26.2 25 26 27.5 27.5V19.5C25 18.2 22.4 18.4 20 20C17.6 18.4 15 18.2 12.5 19.5V27.5Z"
        fill="#4A1728"
        stroke="#F3EBDD"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M20 20V27.8" stroke="#F3EBDD" strokeWidth="1.1" />
      {/* Tiny antique gold four-point star */}
      <path
        d="M20 10.5L20.85 12.65L23 13.5L20.85 14.35L20 16.5L19.15 14.35L17 13.5L19.15 12.65L20 10.5Z"
        fill="#C49A52"
      />
    </svg>
  );
};

