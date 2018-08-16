import * as b from "bobril";
import { interrupted, computed, gotPartialResults } from "../index";

function sleep(timeInMs: number) {
    const start = b.now();
    while (b.now() - start < timeInMs);
}

describe("Interruption", () => {
    afterEach(() => b.init(() => undefined));

    it("Second long computed got interrupted", () => {
        var a1 = false;
        var a2 = false;
        var a3 = false;
        var a4 = false;

        interface IData {}

        class CompCtx extends b.BobrilCtx<IData> {
            @computed
            calc1(): void {
                if (interrupted()) {
                    a1 = true;
                    return;
                }
                sleep(10);
                expect(interrupted()).toBeFalsy("Minimum progress must be preserved");
            }

            @computed
            calc2(): void {
                if (interrupted()) {
                    a2 = true;
                    return;
                }
                sleep(10);
            }
        }

        const Comp = b.createComponent({
            ctxClass: CompCtx,
            render(ctx: CompCtx) {
                ctx.calc1();
                expect(gotPartialResults()).toBeFalsy();
                ctx.calc2();
                a3 = gotPartialResults();
                a4 = interrupted();
            }
        });

        b.init(() => Comp());
        b.syncUpdate();
        expect(a1).toBeFalsy();
        expect(a2).toBeTruthy();
        expect(a3).toBeTruthy();
        expect(a4).toBeTruthy();
        expect(b.invalidated()).toBeTruthy();
        a1 = a2 = a3 = a4 = false;
        b.syncUpdate();
        expect(a1).toBeFalsy();
        expect(a2).toBeFalsy();
        expect(a3).toBeFalsy();
        expect(a4).toBeTruthy();
        expect(b.invalidated()).toBeTruthy();
        a1 = a2 = a3 = a4 = false;
        b.syncUpdate();
        expect(a1).toBeFalsy();
        expect(a2).toBeFalsy();
        expect(a3).toBeFalsy();
        expect(a4).toBeFalsy();
    });
});
