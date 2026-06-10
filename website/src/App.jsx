import { useEffect, useRef } from "react";
import p5 from "p5";
import "./App.scss";

const CHARS =
  " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const CELL_W = 6;
const CELL_H = 10;
const FONT_SIZE = 11;

function App() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    let instance;
    let visibilityHandler;

    const sketch = (p) => {
      let gfx;
      let cols;
      let rows;

      const setupBuffer = () => {
        cols = Math.max(1, Math.floor(p.windowWidth / CELL_W));
        rows = Math.max(1, Math.floor(p.windowHeight / CELL_H));
        // Dispose the previous WEBGL buffer before allocating a new one;
        // otherwise each resize leaks a GPU context.
        gfx?.remove();
        gfx = p.createGraphics(cols, rows, p.WEBGL);
        gfx.pixelDensity(1);
        gfx.noStroke();
      };

      const handleVisibility = () => {
        // The pixel readback + thousands of text() calls are pure waste when
        // the tab is hidden. Pause the draw loop until it's visible again.
        if (document.hidden) {
          p.noLoop();
        } else {
          p.loop();
        }
      };

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.textFont("monospace");
        p.textSize(FONT_SIZE);
        p.textAlign(p.LEFT, p.TOP);
        p.noStroke();
        setupBuffer();
        visibilityHandler = handleVisibility;
        document.addEventListener("visibilitychange", visibilityHandler);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        setupBuffer();
      };

      p.draw = () => {
        const base = Math.min(cols, rows) * 0.45;
        const t = p.frameCount * 0.012;
        const w = base * (1 + 0.6 * Math.sin(t));
        const h = base * (1 + 0.6 * Math.sin(t * 0.7 + 1.3));
        const d = base * (1 + 0.6 * Math.sin(t * 1.3 + 2.6));

        gfx.background(20);
        gfx.push();
        gfx.rotateX(p.frameCount * 0.01);
        gfx.rotateY(p.frameCount * 0.015);
        gfx.rotateZ(p.frameCount * 0.005);
        gfx.normalMaterial();
        gfx.box(w, h, d);
        gfx.pop();

        gfx.loadPixels();
        const px = gfx.pixels;

        p.background(20);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = 4 * (y * cols + x);
            const r = px[i];
            const g = px[i + 1];
            const b = px[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum < 20) continue;
            const ci = Math.min(
              CHARS.length - 1,
              Math.floor((lum / 255) * CHARS.length),
            );
            p.fill(r, g, b);
            p.text(CHARS[ci], x * CELL_W, y * CELL_H);
          }
        }
      };
    };

    const timeoutId = setTimeout(() => {
      instance = new p5(sketch, container);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      instance?.remove();
    };
  }, []);

  return (
    <div className="app">
      <div className="app__canvas" ref={containerRef} />
      <footer className="app__footer">
        <a
          className="app__footer-text"
          href="https://romellogoodman.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Romello Goodman
        </a>
        <span className="app__footer-text">|</span>
        <a
          className="app__footer-text"
          href="https://github.com/romellogoodman/monolith"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open the Monolith
        </a>
      </footer>
    </div>
  );
}

export default App;
