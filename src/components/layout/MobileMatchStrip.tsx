import React from 'react';
import type { Player } from '../../types';

interface MobileMatchStripProps {
  currentPlayer: Player;
  blackName: string;
  whiteName: string;
  blackRank: string;
  whiteRank: string;
  /** Black stones taken off the board, i.e. what White has captured. */
  capturedBlack: number;
  /** White stones taken off the board, i.e. what Black has captured. */
  capturedWhite: number;
  boardSize: number;
  komi: number;
  handicap: number;
}

interface MatchPlayerProps {
  color: Player;
  name: string;
  rank: string;
  captures: number;
  toMove: boolean;
  fallback: string;
}

const MatchPlayer: React.FC<MatchPlayerProps> = ({ color, name, rank, captures, toMove, fallback }) => {
  const displayName = name.trim() || fallback;
  return (
    <div
      className={['mobile-match-player', toMove ? 'is-to-move' : ''].filter(Boolean).join(' ')}
      data-mobile-match-player={color}
      data-to-move={toMove ? 'true' : 'false'}
    >
      <span
        className={['mobile-bottom-stone', color === 'black' ? 'mobile-bottom-stone-black' : 'mobile-bottom-stone-white'].join(' ')}
        aria-hidden="true"
      />
      <span className="mobile-match-name" title={rank ? `${displayName} (${rank})` : displayName}>
        {displayName}
      </span>
      {rank ? <span className="mobile-match-rank">{rank}</span> : null}
      {captures > 0 ? (
        <span className="mobile-match-captures" title={`${captures} captured`}>
          +{captures}
        </span>
      ) : null}
      {toMove ? <span className="sr-only">to move</span> : null}
    </div>
  );
};

/**
 * Phone-portrait companion to the desktop game strip. The board is
 * width-limited there, so the shell centres it inside a much taller box; this
 * fills the top of that spare band with the facts the bottom control bar has
 * to hide below 415px — who is to move, both names and capture counts.
 */
export const MobileMatchStrip: React.FC<MobileMatchStripProps> = ({
  currentPlayer,
  blackName,
  whiteName,
  blackRank,
  whiteRank,
  capturedBlack,
  capturedWhite,
  boardSize,
  komi,
  handicap,
}) => (
  <div className="mobile-match-strip" role="group" aria-label="Match status" data-mobile-match-strip="true">
    <MatchPlayer
      color="black"
      name={blackName}
      rank={blackRank}
      captures={capturedWhite}
      toMove={currentPlayer === 'black'}
      fallback="Black"
    />
    <MatchPlayer
      color="white"
      name={whiteName}
      rank={whiteRank}
      captures={capturedBlack}
      toMove={currentPlayer === 'white'}
      fallback="White"
    />
    <div className="mobile-match-facts" aria-hidden="true">
      <span className="mobile-match-fact">{boardSize}×{boardSize}</span>
      {handicap > 0 ? <span className="mobile-match-fact">H{handicap}</span> : null}
      <span className="mobile-match-fact">komi {komi}</span>
    </div>
  </div>
);

MobileMatchStrip.displayName = 'MobileMatchStrip';
