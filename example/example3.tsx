import * as b from 'bobril';
import { observable } from '../index';

class CounterCtx extends b.BobrilCtx {
    @observable n = 0;
    interval: number = -1;
    start() {
        this.interval = setInterval(() => this.n++, 2000);
    }
    stop() {
        clearInterval(this.interval);
    }
}

const Counter = b.createVirtualComponent({
    id: "Counter",
    ctxClass: CounterCtx,
    init(ctx: CounterCtx) {
        ctx.start();
    },
    destroy(ctx: CounterCtx) {
        ctx.stop();
    },
    render(ctx: CounterCtx, me: b.IBobrilNode) {
        me.children = ctx.n;
    }
});

b.addRoot(() => Counter());
