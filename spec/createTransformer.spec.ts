import * as bobx from "../index";

describe("createTransformer", () => {
    it("it caches values in reactive scope", () => {
        let factoryCalls = 0;
        let freeCalls = 0;
        var transform = bobx.createTransformer(
            (src: number) => {
                factoryCalls++;
                return src * src;
            },
            () => {
                freeCalls++;
            }
        );
        bobx.reactiveScope(() => {
            expect(transform(1)).toBe(1);
            expect(factoryCalls).toBe(1);
            expect(transform(2)).toBe(4);
            expect(factoryCalls).toBe(2);
            expect(transform(2)).toBe(4);
            expect(factoryCalls).toBe(2); // Value is cached
            expect(freeCalls).toBe(0);
        });
        expect(freeCalls).toBe(2);
    });

    it("it is useless outside of reactive scope, but at least does not leak", () => {
        let factoryCalls = 0;
        let freeCalls = 0;
        var transform = bobx.createTransformer(
            (src: number) => {
                factoryCalls++;
                return src * src;
            },
            (target, source) => {
                expect(target).toBe(4);
                expect(source).toBe(2);
                freeCalls++;
            }
        );
        expect(transform(2)).toBe(4);
        expect(factoryCalls).toBe(1);
        expect(freeCalls).toBe(1); // It immediately free computed
        expect(transform(2)).toBe(4);
        expect(factoryCalls).toBe(2); // It does not cache values outside of reactive scope
        expect(freeCalls).toBe(2);
    });

    it("factory function behaves as computed", () => {
        let factoryCalls = 0;
        let input = bobx.observable(2);
        var transform = bobx.createTransformer((src: number) => {
            factoryCalls++;
            return src * input.get();
        });
        bobx.reactiveScope(() => {
            expect(transform(2)).toBe(4);
            expect(transform(2)).toBe(4);
            expect(factoryCalls).toBe(1); // Value is cached
            input.set(1);
            expect(transform(2)).toBe(2);
            expect(factoryCalls).toBe(2); // Value is recomputed because of reactive changes
        });
    });
});
