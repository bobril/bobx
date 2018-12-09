import { computed, observable, reactiveScope } from "../index";

describe("parametric computed", () => {
    let calls = 0;
    let frees = 0;
    class C1 {
        @observable
        v: number = 1;

        @computed
        f1(p: number) {
            calls++;
            return p + this.v;
        }

        @computed.customized({
            getHashCode(_params: any[]) {
                return 0;
            },
            onFree() {
                frees++;
            }
        })
        f2(p: number) {
            calls++;
            return p + this.v;
        }

        @computed
        f3(p1: C1, p2: string): string {
            calls++;
            return p1.v + p2;
        }
    }

    it("function(number) in reactive scope", () => {
        let c = new C1();
        calls = 0;
        reactiveScope(() => {
            expect(c.f1(1)).toBe(2);
            expect(calls).toBe(1);
            expect(c.f1(2)).toBe(3);
            expect(calls).toBe(2);
            expect(c.f1(2)).toBe(3);
            expect(calls).toBe(2);
            c.v = 2;
            expect(c.f1(2)).toBe(4);
            expect(calls).toBe(3);
            expect(c.f1(2)).toBe(4);
            expect(calls).toBe(3);
        });
    });

    it("function(number) outside reactive scope", () => {
        let c = new C1();
        calls = 0;
        expect(c.f1(1)).toBe(2);
        expect(calls).toBe(1);
        expect(c.f1(1)).toBe(2);
        expect(calls).toBe(2);
        c.v = 2;
        expect(c.f1(1)).toBe(3);
        expect(calls).toBe(3);
    });

    it("customized function(number) in reactive scope", () => {
        let c = new C1();
        calls = 0;
        frees = 0;
        reactiveScope(() => {
            expect(c.f2(1)).toBe(2);
            expect(calls).toBe(1);
            expect(c.f2(2)).toBe(3);
            expect(calls).toBe(2);
            expect(c.f2(2)).toBe(3);
            expect(calls).toBe(2);
            c.v = 2;
            expect(c.f2(2)).toBe(4);
            expect(calls).toBe(3);
            expect(c.f2(2)).toBe(4);
            expect(calls).toBe(3);
            expect(frees).toBe(0);
        });
        expect(frees).toBe(2);
    });

    it("function(object, string) in reactive scope", () => {
        let c = new C1();
        calls = 0;
        let p1 = new C1();
        let p2 = new C1();
        p2.v = 10;
        reactiveScope(() => {
            expect(c.f3(p1, "a")).toBe("1a");
            expect(calls).toBe(1);
            expect(c.f3(p2, "a")).toBe("10a");
            expect(calls).toBe(2);
            expect(c.f3(p1, "a")).toBe("1a");
            expect(calls).toBe(2);
            expect(c.f3(p1, "b")).toBe("1b");
            expect(calls).toBe(3);
            p1.v = 2;
            expect(c.f3(p1, "b")).toBe("2b");
            expect(calls).toBe(4);
            expect(c.f3(p2, "a")).toBe("10a");
            expect(calls).toBe(4);
        });
    });
});
