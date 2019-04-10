import * as b from "bobril";
import * as bobx from "../index";

describe("useComputed", () => {
    it("caches results", () => {
        let called = 0;

        function Comp() {
            const c = bobx.useComputed(() => {
                called++;
                return <div />;
            });
            return c();
        }

        b.init(() => <Comp />);
        b.syncUpdate();
        expect(called).toBe(1);
        b.invalidate();
        b.syncUpdate();
        expect(called).toBe(1);
        b.init(() => undefined);
        b.syncUpdate();
    });

    it("immediately dispose all when component destroyed", () => {
        let freeCount = 0;

        function Comp({ input }: { input: number }) {
            const c = bobx.useComputed(
                (input: number) => {
                    return <div>{input}</div>;
                },
                { onFree: () => freeCount++ }
            );
            return (
                <>
                    {c(input)}
                    {c(input + 1)}
                </>
            );
        }

        let input = 1;
        b.init(() => <Comp input={input} />);
        b.syncUpdate();
        expect(freeCount).toBe(0);
        input = 2;
        b.invalidate();
        b.syncUpdate();
        // old computed values are removed only on start of another frame
        b.syncUpdate();
        expect(freeCount).toBe(1);
        b.init(() => undefined);
        b.syncUpdate();
        expect(freeCount).toBe(3);
    });
});
