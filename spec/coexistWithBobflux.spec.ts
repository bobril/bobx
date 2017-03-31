import * as b from 'bobril';
import * as f from 'bobflux';
import { observable } from "../index";

interface ICtx extends f.IContext<IState> {
}

interface IState extends f.IState {
    value: string
}

describe("Coexist with shouldChange (Bobflux)", () => {
    it("works", () => {
        const obsVal = observable("bobx stored");
        f.bootstrap({ value: "default" }, {});
        let renderCallCount = 0;
        let readObservableInRender = true;
        const factory = f.createComponent<IState>({
            render(_ctx: ICtx, me: b.IBobrilNode) {
                me.children = readObservableInRender ? obsVal.get() : "const";
                renderCallCount++;
            }
        });

        const cursor = { key: "value" };
        b.init(factory(cursor));
        b.syncUpdate();
        expect(renderCallCount).toBe(1);
        // Global invalidate is not enough to render bobflux component
        b.invalidate();
        b.syncUpdate();
        expect(renderCallCount).toBe(1);
        // But changing observable will render it (Bobx forcesShouldChange)
        obsVal.set("Change");
        b.syncUpdate();
        expect(renderCallCount).toBe(2);
        // Stop using observable in render and force render by triggering bobflux action to unlink observable
        readObservableInRender = false;
        f.createParamLessAction(cursor, () => { return "newValue" })();
        b.syncUpdate();
        expect(renderCallCount).toBe(3);
        // Change observable again, but now without any effect
        obsVal.set("Not listened change");
        b.syncUpdate();
        expect(renderCallCount).toBe(3);
        // Clean up
        b.init(() => undefined);
    });
});
