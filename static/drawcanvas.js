//@ts-check
import { notnull } from './util.mjs';

const NUM_SAMPLES = 150;

export class DrawCanvasElement extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        const shadowRoot = notnull(this.shadowRoot);
        shadowRoot.innerHTML = `
            <style>
                canvas {
                    border: 1px solid black;
                }
            </style>
            <canvas width="400" height="400"></canvas>
        `;
        this.canvas = notnull(shadowRoot.querySelector('canvas'));
        this.canvas.height = 100;
        this.canvas.width = 400;
        this.ctx = notnull(this.canvas.getContext('2d'));

        this.mouse_down = false;
        /** @typedef {number[]} */
        this.samples = new Array(NUM_SAMPLES).fill(0);

        this.on_mouse_down = this.on_mouse_down.bind(this);
        this.on_mouse_up = this.on_mouse_up.bind(this);
        this.on_mouse_move = this.on_mouse_move.bind(this);
        
        this.last_x_perc = 0;
        this.last_y_perc = 0;

        this.stroke_color = "black";
    }

    connectedCallback() {
        this.addEventListener("mousedown", this.on_mouse_down, { passive: true });
        document.addEventListener("mouseup", this.on_mouse_up, { passive: true });
        document.addEventListener("mousemove", this.on_mouse_move, { passive: true });

        this.stroke_color = this.getAttribute("stroke-color") || "black";

        this.draw_samples();
    }

    disconnectedCallback() {
        this.removeEventListener("mousedown", this.on_mouse_down);
        document.removeEventListener("mouseup", this.on_mouse_up);
        document.removeEventListener("mousemove", this.on_mouse_move);
    }

    on_mouse_down(e) {
        this.mouse_down = true;
        const rect = this.canvas.getBoundingClientRect();
        this.last_x_perc = (e.clientX - rect.left) / this.canvas.width;
        this.last_y_perc = 1 - ((e.clientY - rect.top) / this.canvas.height);
    }
    on_mouse_up(e) {
        this.mouse_down = false;
    }
    on_mouse_move(e) {
        if (this.mouse_down) {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const x_perc = Math.max(Math.min(x / this.canvas.width, 1), 0);
            const y_perc = Math.max(Math.min(1 - (y / this.canvas.height), 1), 0);
            // set all from this.last_x_perc to x_perc to linterp last_y_perc to y_perc
            const x0 = Math.floor(this.last_x_perc * NUM_SAMPLES);
            const x1 = Math.floor(x_perc * NUM_SAMPLES);
            const y0 = this.last_y_perc;
            const y1 = y_perc;
            const [xlow, ylow, xhigh, yhigh] = x0 < x1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0];
            for (let i = xlow; i <= xhigh; i++) {
                const perc = (i - xlow) / (xhigh - xlow);
                this.samples[i] = ylow + perc * (yhigh - ylow);
            }
            this.last_x_perc = x_perc;
            this.last_y_perc = y_perc;

            // const sample = Math.floor(x_perc * NUM_SAMPLES);
            // this.samples[sample] = y_perc;
            this.draw_samples();
        }
    }

    draw_samples() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height * (1 - this.samples[0]));
        this.ctx.lineWidth = 8;
        this.ctx.lineJoin = "round";
        this.ctx.strokeStyle = this.stroke_color;
        for (let i = 1; i < NUM_SAMPLES; i++) {
            const samp = this.samples[i];
            this.ctx.lineTo(i * this.canvas.width / NUM_SAMPLES, this.canvas.height * (1 - samp));
        }
        this.ctx.stroke();
    }
}

window.customElements.define('draw-canvas', DrawCanvasElement);