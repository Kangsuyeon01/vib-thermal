//@ts-check
import { notnull } from './util.mjs';

const NUM_SAMPLES = 150;

export class DrawCanvasElement extends HTMLElement {

    #_resize_observer = new ResizeObserver(this.#_on_self_resize.bind(this));

    static observedAttributes = ["width", "height"];
    attributeChangedCallback(name, oldValue, newValue) {
		if (name === "width") this.width = parseInt(newValue);
		else if (name === "height") this.height = parseInt(newValue);
	}

	/** @type {number | null} */
	#_set_width = null;
	/** @type {number | null} */
	#_set_height = null;
	set width(value) {
		this.#_set_width = value;
		this.canvas.width = value;
		this.draw_samples();
	}
	get width() {
		return this.#_set_width ?? this.canvas.width;
	}
	set height(value) {
		this.#_set_height = value;
		this.canvas.height = value;
		this.draw_samples();
	}
	get height() {
		return this.#_set_height ?? this.canvas.height;
	}

    #_on_self_resize() {
		if (!this.#_set_width) this.canvas.width = this.clientWidth ?? 400;
		if (!this.#_set_height) this.canvas.height = this.clientHeight ?? 100;
		this.draw_samples();
	}

    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        const shadowRoot = notnull(this.shadowRoot);
        shadowRoot.innerHTML = `
            <style>
                canvas {
                    /* border: 1px solid black; */
                }
            </style>
            <canvas width="400" height="100"></canvas>
        `;
        this.canvas = notnull(shadowRoot.querySelector('canvas'));
        this.canvas.height = 100;
        this.canvas.width = 400;
        this.ctx = notnull(this.canvas.getContext('2d'));

        this.mouse_down = false;

        /** @type {number[]} */
        this.samples = new Array(NUM_SAMPLES).fill(0);
        this.#_fill_random_samples();

        this.on_mouse_down = this.on_mouse_down.bind(this);
        this.on_mouse_up = this.on_mouse_up.bind(this);
        this.on_mouse_move = this.on_mouse_move.bind(this);
        
        this.last_x_perc = 0;
        this.last_y_perc = 0;

        this.stroke_color = "black";
    }

    #_fill_random_samples() {
        const [r1, r2] = [Math.random(), Math.random()];
        const low = Math.min(r1, r2);
        const high = Math.max(r1, r2);
        const value = Math.random() * 0.8 + 0.2;
        for (let i = NUM_SAMPLES*low; i < NUM_SAMPLES*high; i++) {
            this.samples[Math.floor(i)] = value;
        }
    }

    connectedCallback() {
        this.addEventListener("mousedown", this.on_mouse_down, { passive: true });
        document.addEventListener("mouseup", this.on_mouse_up, { passive: true });
        document.addEventListener("mousemove", this.on_mouse_move, { passive: true });

        this.stroke_color = this.getAttribute("stroke-color") || "black";

        this.#_resize_observer.observe(this);
        this.#_on_self_resize();
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
            // console.log(xlow, ylow, xhigh, yhigh);
            for (let i = xlow; i <= xhigh; i++) {
                const perc = (i - xlow) / (xhigh - xlow + 1e-6);
                this.samples[i] = ylow + perc * (yhigh - ylow);
            }
            this.last_x_perc = x_perc;
            this.last_y_perc = y_perc;

            // const sample = Math.floor(x_perc * NUM_SAMPLES);
            // this.samples[sample] = y_perc;
            this.draw_samples();
        }
    }

    #_total_duration = 10;
    set_duration(duration) {
        this.#_total_duration = duration;
        this.draw_samples();
    }

    draw_grid() {
        // draw 1 second lines, and 0.25 amplitude lines
        this.ctx.beginPath();
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = "lightgray";
        const line_dist = this.canvas.width / this.#_total_duration;
        for (let i = 1; i < this.#_total_duration; i++) {
            this.ctx.moveTo(i * line_dist, 0);
            this.ctx.lineTo(i * line_dist, this.canvas.height);
        }
        for (let i = 1; i < 4; i++) {
            this.ctx.moveTo(0, i * this.canvas.height / 4);
            this.ctx.lineTo(this.canvas.width, i * this.canvas.height / 4);
        }
        this.ctx.stroke();
    }

    draw_samples() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.draw_grid();
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