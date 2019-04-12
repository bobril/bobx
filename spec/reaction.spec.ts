import * as b from "bobril";
import { reaction, observable, computed } from "../index";

describe("reaction", () => {
    it("runs immediately", () => {
        let count = 0;
        const r = reaction(
            () => "a",
            value => {
                count++;
                expect(value).toBe("a");
            }
        );
        expect(count).toBe(0);
        b.syncUpdate();
        expect(count).toBe(1);
        r.dispose();
    });

    it("runs when observed value changes", () => {
        let count = 0;
        const o = observable({ v: 0 });
        let last: number | undefined;
        const r = reaction(
            () => o.v,
            value => {
                count++;
                last = value;
            }
        );
        b.syncUpdate();
        expect(count).toBe(1);
        expect(last).toBe(0);
        b.syncUpdate();
        expect(count).toBe(1);
        o.v = 1;
        b.syncUpdate();
        expect(count).toBe(2);
        expect(last).toBe(1);
        o.v = 2;
        o.v = 1;
        b.syncUpdate();
        expect(count).toBe(2);
        expect(last).toBe(1);
        r.dispose();
    });

    class C {
        @observable
        v = 0;
        @computed
        f() {
            return this.v % 4;
        }
    }

    it("runs when observed computed changes", () => {
        let exprCount = 0;
        let effectCount = 0;
        let lastResult = 0;
        const c = new C();
        const r = reaction(
            () => {
                exprCount++;
                return c.f() % 2;
            },
            value => {
                effectCount++;
                lastResult = value;
            }
        );
        expect([exprCount, effectCount, lastResult]).toEqual([0, 0, 0]);
        b.syncUpdate();
        expect([exprCount, effectCount, lastResult]).toEqual([1, 1, 0]);
        c.v = 4;
        b.syncUpdate();
        expect([exprCount, effectCount, lastResult]).toEqual([1, 1, 0]);
        c.v = 2;
        b.syncUpdate();
        expect([exprCount, effectCount, lastResult]).toEqual([2, 1, 0]);
        c.v = 1;
        b.syncUpdate();
        expect([exprCount, effectCount, lastResult]).toEqual([3, 2, 1]);
        r.dispose();
    });
});
