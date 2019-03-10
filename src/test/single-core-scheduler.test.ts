import { SingleCoreScheduler } from "../lib/single-core-scheduler";

describe("single-core scheduler", () => {

    it("can run task with no inputs", ()  => {

        const mockTaskFn = jest.fn();

        const mockTask: any = {
            getTaskDef: () => ({
                getTaskFn: () => mockTaskFn,
            }),
        };

        const scheduler = new SingleCoreScheduler();
        scheduler.runTask([], mockTask);

        expect(mockTaskFn).toBeCalledTimes(1);
    });

    it("can run task with inputs", ()  => {

        const mockTaskFn = jest.fn();

        const mockTask: any = {
            getTaskDef: () => ({
                getTaskFn: () => mockTaskFn,
            }),
        };

        const scheduler = new SingleCoreScheduler();
        scheduler.runTask([1, 2, "hello"], mockTask);

        expect(mockTaskFn).toBeCalledTimes(1);
        expect(mockTaskFn).toBeCalledWith(1, 2, "hello", scheduler);
    });
});
