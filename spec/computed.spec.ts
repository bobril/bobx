import * as b from "bobril";
import { computed, observable, reactiveScope, debugRunWhenInvalidated } from "../index";

declare var DEBUG: boolean;

describe("computed", () => {
    it("simple function returning constant", () => {
        class C1 {
            @computed
            f1() {
                return 42;
            }
        }
        let c = new C1();
        expect(c.f1()).toBe(42);
    });

    it("usable as getter", () => {
        class C1g {
            @computed
            get p() {
                return 42;
            }
        }
        let c = new C1g();
        expect(c.p).toBe(42);
    });

    it("usable also with setter", () => {
        let vv = 0;
        class C1g {
            @computed
            get p() {
                return 42;
            }
            set p(v: number) {
                vv = v;
            }
        }
        let c = new C1g();
        c.p = 1;
        expect(vv).toBe(1);
        expect(c.p).toBe(42);
    });

    let computedCallCount = 0;
    class C2 {
        @observable
        v = 0;
        @computed
        f() {
            computedCallCount++;
            return this.v + 1;
        }
    }

    it("dependent on observable value", () => {
        computedCallCount = 0;
        let c = new C2();
        reactiveScope(() => {
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

    it("compare comparers", () => {
        let v = observable(0);
        class C {
            @computed
            f(): { a: number } {
                return { a: v.get() % 4 };
            }
            @computed.struct
            fs(): { a: number } {
                return { a: v.get() % 4 };
            }
            @computed.equals<{ a: number }>((o, n) => o.a % 2 == n.a % 2)
            fe(): { a: number } {
                return { a: v.get() % 4 };
            }
        }

        let c = new C();
        let renderCalledCount = 0;
        let renderCalledCountS = 0;
        let renderCalledCountE = 0;
        let rootId1 = b.addRoot(() => ++renderCalledCount + c.f().a);
        let rootId2 = b.addRoot(() => ++renderCalledCountS + c.fs().a);
        let rootId3 = b.addRoot(() => ++renderCalledCountE + c.fe().a);
        b.syncUpdate();
        expect(renderCalledCount).toBe(1);
        expect(renderCalledCountS).toBe(1);
        expect(renderCalledCountE).toBe(1);
        v.set(4);
        b.syncUpdate();
        expect(renderCalledCount).toBe(2);
        expect(renderCalledCountS).toBe(1);
        expect(renderCalledCountE).toBe(1);
        v.set(2);
        b.syncUpdate();
        expect(renderCalledCount).toBe(3);
        expect(renderCalledCountS).toBe(2);
        expect(renderCalledCountE).toBe(1);
        v.set(1);
        b.syncUpdate();
        expect(renderCalledCount).toBe(4);
        expect(renderCalledCountS).toBe(3);
        expect(renderCalledCountE).toBe(2);
        b.removeRoot(rootId1);
        b.removeRoot(rootId2);
        b.removeRoot(rootId3);
        b.syncUpdate();
    });

    it("super computed calls works", () => {
        class Base {
            @observable
            p: number = 0;
            @computed
            m() {
                return this.p + 1;
            }
        }

        class Derived extends Base {
            @computed
            m() {
                return super.m() + 1;
            }
        }

        let i = new Derived();
        expect(i.m()).toBe(2);
        i.p = 10;
        expect(i.m()).toBe(12);
    });

    it("does not leak", () => {
        let v = observable(0);
        let computedCalls = 0;
        class C {
            @computed
            f(): number {
                computedCalls++;
                return v.get();
            }
        }
        let c = new C();
        b.init(() => c.f());
        b.syncUpdate();
        expect(computedCalls).toBe(1);
        v.set(1);
        b.syncUpdate();
        expect(computedCalls).toBe(2);
        b.init(() => undefined);
        b.syncUpdate();
        expect(computedCalls).toBe(2);
        b.init(() => c.f());
        b.syncUpdate();
        expect(computedCalls).toBe(3);
        b.init(() => undefined);
        b.syncUpdate();
    });

    it("nested computed are called optimally", () => {
        let v = observable(0);
        let computedCalls1 = 0;
        let free1 = 0;
        let computedCalls2 = 0;
        let free2 = 0;
        let callF2 = true;
        class C {
            @computed.customized({
                onFree: () => {
                    free1++;
                }
            })
            f1(): number {
                computedCalls1++;
                return (v.get() / 10) | 0;
            }
            @computed.customized({
                onFree: () => {
                    free2++;
                }
            })
            f2(): number {
                computedCalls2++;
                return (this.f1() / 10) | 0;
            }
        }
        let c = new C();
        b.init(() => (callF2 ? c.f2() : c.f1()));
        b.syncUpdate();
        expect(computedCalls1).toBe(1);
        expect(computedCalls2).toBe(1);
        b.syncUpdate();
        expect(computedCalls1).toBe(1);
        expect(computedCalls2).toBe(1);
        expect(free1).toBe(0);
        expect(free2).toBe(0);
        v.set(5);
        b.syncUpdate();
        expect(computedCalls1).toBe(2);
        expect(computedCalls2).toBe(1);
        expect(free1).toBe(0);
        expect(free2).toBe(0);
        v.set(55);
        b.syncUpdate();
        expect(computedCalls1).toBe(3);
        expect(computedCalls2).toBe(2);
        expect(free1).toBe(0);
        expect(free2).toBe(0);
        callF2 = false;
        b.invalidate();
        b.syncUpdate();
        expect(computedCalls1).toBe(3);
        expect(computedCalls2).toBe(2);
        expect(free1).toBe(0);
        expect(free2).toBe(0);
        b.syncUpdate();
        expect(computedCalls1).toBe(3);
        expect(computedCalls2).toBe(2);
        expect(free1).toBe(0);
        expect(free2).toBe(1);
    });

    if (DEBUG) {
        it("debugRunWhenInvalidated works", () => {
            let invalidated = 0;
            class C {
                @observable
                v = 0;
                @computed
                f() {
                    debugRunWhenInvalidated(() => invalidated++);
                    return this.v + 1;
                }
            }

            let c = new C();
            reactiveScope(() => {
                expect(c.f()).toBe(1);
                expect(invalidated).toBe(0);
                c.v = 1;
                expect(invalidated).toBe(1);
            });
        });
    }
});
