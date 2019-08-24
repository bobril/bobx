import * as b from "bobril";
import { asyncComputed, observable } from "../index";

function promiseSource<T>(): { setResult: (value: T) => void; setException: (ex: Error) => void; promise: Promise<T> } {
    const res = { setResult: undefined, setException: undefined, promise: undefined } as any;
    create();
    return res;

    function create() {
        res.promise = new Promise<T>((resolve, reject) => {
            res.setResult = (v: T) => {
                create();
                resolve(v);
            };
            res.setException = (err: any) => {
                create();
                reject(err);
            };
        });
    }
}

function tick() {
    return Promise.resolve();
}

describe("asyncComputed", () => {
    it("has async capability", async () => {
        const p = promiseSource<number>();
        // function * is generator which is very similar to async methods, but have way to customize awaiting behavior
        const c = asyncComputed(function*() {
            // You can yield partial results
            yield 1;
            // Or update them by another yield, because there was no promise from previous value it was invisible to anything
            yield 2;
            // yielding anything promise like is equivalent to await in async method
            // only problem is that resulting type cannot be inferred automatically like in async methods
            const result: number = yield p.promise;
            // returning final result for computed method
            return 2 + result;
        });
        let r1 = c();
        expect(r1.busy).toBe(true);
        expect(r1.result).toBe(2);
        let r2 = c();
        expect(r2).toBe(r1);
        p.setResult(1);
        await tick();
        expect(r1.busy).toBe(false);
        expect(r1.result).toBe(3);
    });

    it("support throwing from promise and catching it in result", async () => {
        const p = promiseSource<number>();
        const c = asyncComputed(function*() {
            yield p.promise;
            return undefined;
        });
        let r = c();
        expect(r.busy).toBe(true);
        expect(r.result).toBe(undefined);
        const ex = new Error("OK");
        p.setException(ex);
        await tick();
        expect(r.busy).toBe(false);
        expect(() => r.result).toThrow(ex);
    });

    it("listen to observable changes", async () => {
        const o = observable(2);
        const c = asyncComputed(function*() {
            yield 1;
            yield tick();
            return o.get();
        });
        b.init(() => {
            return b.styledDiv(c().result);
        });
        b.syncUpdate();
        expect(document.body.innerText).toBe("1");
        await tick();
        expect(b.invalidated()).toBe(true);
        b.syncUpdate();
        expect(document.body.innerText).toBe("2");
        expect(b.invalidated()).toBe(false);
        o.set(3);
        expect(b.invalidated()).toBe(true);
        b.syncUpdate();
        expect(document.body.innerText).toBe("1");
        await tick();
        expect(b.invalidated()).toBe(true);
        b.syncUpdate();
        expect(document.body.innerText).toBe("3");
        b.init(() => undefined);
        b.syncUpdate();
    });
});
