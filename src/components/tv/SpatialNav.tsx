"use client";

import { useEffect } from "react";
import { pickNeighbor, directionFromKey, type Direction, type Rect } from "@/lib/tv/spatial";
import type { TvBridge, TvKey, TvPlayerHandlers } from "@/lib/tv/bridge";

/**
 * Cáscara DOM de la navegación espacial. Monta una vez en `/tv/layout.tsx`.
 *
 * Toda la geometría está en `src/lib/tv/spatial.ts` (puro y testeado); aquí solo
 * se lee el DOM, se mueve el foco y se instala `window.__mxTv` para el APK.
 */

/**
 * Scroll instantáneo, no `"smooth"`, a propósito: en un Fire TV Stick Lite (1GB)
 * el scroll suave se encola con pulsaciones rápidas del mando y el foco parece ir
 * con retraso de media pantalla. El salto seco se siente más responsivo.
 */
const SCROLL: ScrollIntoViewOptions = { block: "center", inline: "center", behavior: "auto" };

/**
 * Elementos donde las flechas horizontales son del propio control, no nuestras:
 * un `range` sube/baja su valor y un campo de texto mueve el cursor. Robarles
 * izquierda/derecha rompería el volumen y la barra de tiempo del player.
 */
function ownsHorizontalKeys(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "SELECT" || el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return type === "range" || type === "text" || type === "search" || type === "email" || type === "password";
}

/** Un `<select>` abre su propio selector nativo en Fire OS: no le tocamos ninguna flecha. */
function ownsVerticalKeys(el: Element | null): boolean {
  return el?.tagName === "SELECT";
}

/** Candidatos al foco, en orden de documento, descartando los que no se pueden ver ni usar. */
function collectFocusables(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-focusable]"));
  return all.filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
    // Rectángulo vacío = `display:none`, `hidden`, o la clase `hidden` de Tailwind.
    // Se comprueba por geometría en vez de `getComputedStyle` porque esto corre en
    // cada pulsación y hay 30-60 elementos por pantalla.
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function move(direction: Direction): boolean {
  const focusables = collectFocusables();
  if (focusables.length === 0) return false;

  const active = document.activeElement as HTMLElement | null;
  const activeIndex = active ? focusables.indexOf(active) : -1;

  // Nada enfocado todavía (recién cargada la página): la primera flecha entra
  // por el primer elemento en vez de no hacer nada.
  if (activeIndex === -1) {
    focusables[0].focus();
    focusables[0].scrollIntoView(SCROLL);
    return true;
  }

  const rects: Rect[] = focusables.map((el) => el.getBoundingClientRect());
  const next = pickNeighbor(rects, activeIndex, direction);
  if (next === null) return false;

  focusables[next].focus();
  focusables[next].scrollIntoView(SCROLL);
  return true;
}

export function SpatialNav() {
  useEffect(() => {
    let player: TvPlayerHandlers | null = null;

    const handleKey = (name: TvKey): boolean => {
      switch (name) {
        case "up":
        case "down":
        case "left":
        case "right":
          return move(name);
        case "select": {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return false;
          el.click();
          return true;
        }
        case "back":
          if (window.history.length > 1) {
            window.history.back();
            return true;
          }
          return false;
        case "play_pause":
          if (!player) return false;
          player.playPause();
          return true;
        case "rewind":
          if (!player) return false;
          player.seek(-10);
          return true;
        case "forward":
          if (!player) return false;
          player.seek(10);
          return true;
      }
    };

    const bridge: TvBridge = {
      version: 1,
      key: handleKey,
      playbackKind: null,
      setPlayer(handlers) {
        player = handlers;
        bridge.playbackKind = handlers?.kind ?? null;
      },
    };
    window.__mxTv = bridge;

    const onKeyDown = (e: KeyboardEvent) => {
      // Un componente puede consumir la tecla antes (el Player lo hace con
      // espacio y las flechas cuando el foco está en el vídeo).
      if (e.defaultPrevented) return;

      const direction = directionFromKey(e.key);
      if (!direction) return;

      const active = document.activeElement;
      const horizontal = direction === "left" || direction === "right";
      if (horizontal && ownsHorizontalKeys(active)) return;
      if (!horizontal && ownsVerticalKeys(active)) return;

      // Evita que además del salto de foco la página scrollee por su cuenta:
      // con `block: "center"` los dos movimientos se pelean y el foco se pierde.
      if (move(direction)) e.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (window.__mxTv === bridge) delete window.__mxTv;
    };
  }, []);

  return null;
}
