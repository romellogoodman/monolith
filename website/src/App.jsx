import { useEffect, useRef } from "react";
import p5 from "p5";
import "./App.scss";

function App() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    let instance;

    const sketch = (p) => {
      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };

      p.draw = () => {
        p.background(20);
        p.rotateX(p.frameCount * 0.01);
        p.rotateY(p.frameCount * 0.015);
        p.rotateZ(p.frameCount * 0.005);
        p.normalMaterial();
        const base = Math.min(p.width, p.height) * 0.3;
        const t = p.frameCount * 0.012;
        const w = base * (1 + 0.6 * Math.sin(t));
        const h = base * (1 + 0.6 * Math.sin(t * 0.7 + 1.3));
        const d = base * (1 + 0.6 * Math.sin(t * 1.3 + 2.6));
        p.box(w, h, d);
      };
    };

    const timeoutId = setTimeout(() => {
      instance = new p5(sketch, container);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
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
          Monolith
        </a>
      </footer>
    </div>
  );
}

export default App;
