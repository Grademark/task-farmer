import { Task } from "..";

describe("task", () => {

    it("can register task", ()  => {

        const myTaskFn = async () => {};
        const myTaskDef = Task.register("my-task", myTaskFn);
        expect(myTaskDef.getTaskName()).toBe("my-task");
        expect(myTaskDef.getTaskFn()).toBe(myTaskFn);
    });

    it("can lookup registered task", ()  => {

        const myTaskDef = Task.register("my-task", async () => {});
        expect(Task.lookup("my-task")).toBe(myTaskDef);
    });

    it("can create task", ()  => {

        const myTaskDef = Task.register("my-task", async () => {});
        const myTask = myTaskDef.create();
        expect(myTask).toBeDefined();
        expect(myTask.getTaskId()).toBeDefined();
        expect(myTask.getTaskDef()).toBe(myTaskDef);
    });

    it("can run task with no inputs", async () => {

        const myTaskDef = Task.register("my-task", async () => {});
        const myTask = myTaskDef.create();

        const mockScheduler: any = {
            runTask: jest.fn((inputs, task) => {
                expect(inputs).toEqual([]);
                expect(task).toBe(myTask);
            }),
        };

        await myTask.run(mockScheduler);

        expect(mockScheduler.runTask).toHaveBeenCalledTimes(1);
    });

    it("can run task with inputs", async () => {

        const mockInput1 = {};
        const mockInputTask1: any = {
            run: jest.fn(async () => mockInput1),
        };

        const mockInput2 = {};
        const mockInputTask2: any = {
            run: jest.fn(async () => mockInput2),
        };

        const myTaskDef = Task.register("my-task", async () => {});
        const myTask = myTaskDef.create(mockInputTask1, mockInputTask2);

        const mockScheduler: any = {
            runTask: jest.fn((inputs, task) => {
                expect(inputs).toEqual([mockInput1, mockInput2]);
                expect(task).toBe(myTask);
            }),
        };

        await myTask.run(mockScheduler);

        expect(mockScheduler.runTask).toHaveBeenCalledTimes(1);
        expect(mockInputTask1.run).toHaveBeenCalledTimes(1);
        expect(mockInputTask2.run).toHaveBeenCalledTimes(1);
    });
});
