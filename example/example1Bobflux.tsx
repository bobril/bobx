import * as b from 'bobril';
import * as f from 'bobflux';

interface ICtx extends f.IContext<number> {
}

f.bootstrap({ counter: 0 });

const cursor: f.ICursor<number> = { key: "counter" };

const Counter = f.createComponent<number>({
    render(ctx: ICtx, me: b.IBobrilNode) {
        me.children = ctx.state;
    }
})(cursor);

const increment = f.createParamLessAction(cursor, (prev) => prev + 1);

setInterval(() => {
    increment();
}, 2000);

b.addRoot(() => Counter());
