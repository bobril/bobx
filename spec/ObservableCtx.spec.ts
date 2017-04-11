import * as b from 'bobril';
import { observable } from '../index';

class CounterCtx extends b.BobrilCtx<any> {
    constructor() {
        super();
        this.counter = 0;
    }

    @observable counter: number;
}

var counterCtx: CounterCtx;
var counterRenderCounter = 0;

const Counter = b.createComponent<CounterCtx>({
    ctxClass: CounterCtx,
    render(ctx: CounterCtx, me: b.IBobrilNode) {
        counterRenderCounter++;
        counterCtx = ctx;
        me.children = ctx.counter;
    }
});

var wrapperRenderCounter = 0;

const Wrapper = b.createComponent({
    render(_ctx: b.IBobrilCtx, me: b.IBobrilNode) {
        wrapperRenderCounter++;
        me.children = Counter();
    }
});

describe("ObservableCtx", () => {
    it("Direct", () => {
        let rootRenderCounter = 0;
        counterRenderCounter = 0;
        b.init(() => {
            rootRenderCounter++;
            return Counter();
        });
        b.syncUpdate();
        expect(counterCtx.counter).toBe(0);
        expect(counterRenderCounter).toBe(1);
        expect(rootRenderCounter).toBe(1);
        counterCtx.counter = 1;
        b.syncUpdate();
        expect(counterCtx.counter).toBe(1);
        expect(counterRenderCounter).toBe(2);
        expect(rootRenderCounter).toBe(1);
        b.invalidate();
        b.syncUpdate();
        expect(counterCtx.counter).toBe(1);
        expect(counterRenderCounter).toBe(3);
        expect(rootRenderCounter).toBe(2);
    });

    it("WithWrapper", () => {
        let rootRenderCounter = 0;
        counterRenderCounter = 0;
        wrapperRenderCounter = 0;
        b.init(() => {
            rootRenderCounter++;
            return Wrapper();
        });
        b.syncUpdate();
        expect(counterCtx.counter).toBe(0);
        expect(counterRenderCounter).toBe(1);
        expect(wrapperRenderCounter).toBe(1);
        expect(rootRenderCounter).toBe(1);
        counterCtx.counter = 1;
        b.syncUpdate();
        expect(counterCtx.counter).toBe(1);
        expect(counterRenderCounter).toBe(2);
        expect(wrapperRenderCounter).toBe(1);
        expect(rootRenderCounter).toBe(1);
        b.invalidate();
        b.syncUpdate();
        expect(counterCtx.counter).toBe(1);
        expect(counterRenderCounter).toBe(3);
        expect(wrapperRenderCounter).toBe(2);
        expect(rootRenderCounter).toBe(2);
    });
});