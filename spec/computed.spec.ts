import * as b from 'bobril';
import { computed, observable } from "../index";

describe("calculated", () => {
    it("simple function returning constant", () => {
        class C1 {
            @computed f1() {
                return 42;
            }
        }
        let c = new C1();
        expect(c.f1()).toBe(42);
    });

    let computedCallCount = 0;
    class C2 {
        @observable v = 0;
        @computed f() {
            computedCallCount++;
            return this.v + 1;
        }
    }

    it("dependent on observable value", () => {
        computedCallCount = 0;
        let c = new C2();
        expect(computedCallCount).toBe(0);
        expect(c.f()).toBe(1);
        expect(computedCallCount).toBe(1);
        expect(c.f()).toBe(1);
        expect(computedCallCount).toBe(1); // check that it memorize result
        c.v = 1;
        expect(computedCallCount).toBe(1); // check that computed is lazy
        expect(c.f()).toBe(2);
        expect(computedCallCount).toBe(2);
    });

    it("used in render", () => {
        let c = new C2();
        let renderCalledCount = 0;
        let rootId = b.addRoot(() => ++renderCalledCount + c.f());
        b.syncUpdate();
        computedCallCount = 0;
        expect(renderCalledCount).toBe(1);
        b.syncUpdate();
        expect(computedCallCount).toBe(0);
        expect(renderCalledCount).toBe(1);
        c.v = 1;
        expect(computedCallCount).toBe(0);
        expect(renderCalledCount).toBe(1);
        b.syncUpdate();
        expect(computedCallCount).toBe(1);
        expect(renderCalledCount).toBe(2);
        b.syncUpdate();
        expect(computedCallCount).toBe(1);
        expect(renderCalledCount).toBe(2);
        b.removeRoot(rootId);
        b.syncUpdate();
        c.v = 2;
        expect(computedCallCount).toBe(1);
        expect(c.f()).toBe(3);
        expect(computedCallCount).toBe(2);
    });
});
