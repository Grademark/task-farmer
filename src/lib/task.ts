import { v4 as uuid } from "uuid";
import { IScheduler } from "./scheduler";

export type TaskFn<ResultT> = (...args: any[]) => Promise<ResultT>;

//
// Defines a parallelizable asynchronous task.
//
export interface ITaskDef<ResultT> {

    //
    // Retreive the user-defined name of the task.
    //
    getTaskName(): string;

    //
    // Get the function that is invoked to perform the task.
    //
    getTaskFn(): TaskFn<ResultT>;

    //
    // Instantiate a task from the definition.
    //
    create(...inputs: any[]): ITask<ResultT>;
}

//
// Defines a parallelizable asynchronous task.
//
class TaskDef<ResultT> implements ITaskDef<ResultT> {

    //
    // The name of the task.
    //
    private taskName: string;
    private taskFn: TaskFn<ResultT>;

    constructor(taskName: string, taskFn: TaskFn<ResultT>) {
        this.taskName = taskName;
        this.taskFn = taskFn;
    }

    //
    // Retreive the user-defined name of the task.
    //
    public getTaskName(): string {
        return this.taskName;
    }

    //
    // Get the function that is invoked to perform the task.
    //
    public getTaskFn(): TaskFn<ResultT> {
        return this.taskFn;
    }

    //
    // Instantiate a task from the definition.
    //
    public create(...inputs: any[]): ITask<ResultT> {
        const wrappedTasks = inputs.map(this.wrapTask); // Wrap direct inputs as tasks.
        return new Task<ResultT>(wrappedTasks, this);
    }

    //
    // Wrap direct values in tasks where necessary.
    //
    private wrapTask(input: any) {
        if (typeof(input.run) === "function") {
            // It's a task.
            return input;
        }
        else {
            // It's a direct value, so wrap it in a task.
            return new WrappedValue(input);
        }
    }
}

//
// Interface to a parallelizable asynchronous task.
//
export interface ITask<ResultT> {

    //
    // Retreive the unique ID for the task.
    //
    getTaskId(): string;

    //
    // Retreive the task definition.
    //
    getTaskDef(): ITaskDef<ResultT>;

    //
    // Run a task and all it's input tasks as soon as workers are available.
    // Returns a promise that is resolved when the task and its inputs have completed successfully.
    // Rejects the promise if the task or any input throws an error.
    //
    run(scheduler: IScheduler): Promise<ResultT>;
}

//
// Interface to a parallelizable asynchronous task.
//
export class Task<ResultT> implements ITask<ResultT> {

    //
    // Register a task.
    //
    public static register<ResultT>(taskName: string, taskFn: TaskFn<ResultT>): ITaskDef<ResultT> {
        const taskDef = new TaskDef<ResultT>(taskName, taskFn);
        Task.taskDefs[taskDef.getTaskName()] = taskDef;
        return taskDef;
    }

    // 
    // Look up a task.
    //
    public static lookup<ResultT>(taskDefId: string): ITaskDef<ResultT> {
        return Task.taskDefs[taskDefId];
    }

    //
    // Run multiple tasks in parallel and collect their results as an array.
    //
    public static all<ResultT>(inputTasks: ITask<ResultT>[]): ITask<ResultT[]> {
        return new AllTask<ResultT>(inputTasks);
    }

    //
    // Lookup table for tasks.
    // Allows task to be found by name when request to run in a worker process.
    //
    private static taskDefs: any = {};
    
    //
    // The unique ID for the task.
    //
    private taskId: string;

    //
    // Tasks that provide input to this task.
    //
    private inputTasks: ITask<any>[];

    //
    // The definition of this task.
    //
    private taskDef: ITaskDef<ResultT>;

    constructor(inputTasks: ITask<any>[], taskDef: ITaskDef<ResultT>) {
        this.taskId = uuid();
        this.inputTasks = inputTasks;
        this.taskDef = taskDef;
    }
    
    //
    // Retreive the unique ID for the task.
    //
    public getTaskId(): string {
        return this.taskId;
    }

    //
    // Retreive the task definition.
    //
    public getTaskDef(): ITaskDef<ResultT> {
        return this.taskDef;
    }

    //
    // Run a task and all it's input tasks as soon as workers are available.
    // Returns a promise that is resolved when the task and its inputs have completed successfully.
    // Rejects the promise if the task or any input throws an error.
    //
    public async run(scheduler: IScheduler): Promise<ResultT> {
        const inputs = await Promise.all(this.inputTasks.map(inputTask => inputTask.run(scheduler)));
        return await scheduler.runTask(inputs, this);
    }
}

//
// A task that wraps up a direct value.
//
class WrappedValue implements ITask<any> {

    //
    // The value being wrapped as a task.
    //
    private value: any;

    constructor(value: any) {
        this.value = value;
    }

     //
    // Retreive the unique ID for the task.
    //
    public getTaskId(): string {
        return "wrapped"; // This doesn't need a distinct ID because it's not to be transmitted to a worker process.
    }

    //
    // Retreive the task definition.
    //
    public getTaskDef(): ITaskDef<any> {
        return new TaskDef<any>("wrapped", async () => {});
    }

    //
    // Simply returns the wrapped value.
    //
    public run(scheduler: IScheduler): Promise<any> {
        return this.value;
    }

}
//
// A task that aggregates a list of tasks.
//
class AllTask<ResultT> implements ITask<ResultT[]> {

    //
    // The input tasks to be aggregated.
    //
    private inputTasks: ITask<ResultT>[];

    constructor(inputTasks: ITask<ResultT>[]) {
        this.inputTasks = inputTasks;
    }

     //
    // Retreive the unique ID for the task.
    //
    public getTaskId(): string {
        return "all"; // This doesn't need a distinct ID because it's not to be transmitted to a worker process.
    }

    //
    // Retreive the task definition.
    //
    public getTaskDef(): ITaskDef<ResultT[]> {
        return new TaskDef<any>("all", async () => {}); //TODO: Is there a better design that doesn't need these fake implementations?
    }

    //
    // Simply returns the wrapped value.
    //
    public async run(scheduler: IScheduler): Promise<ResultT[]> {
        return await Promise.all(this.inputTasks.map(inputTask => inputTask.run(scheduler)));
    }
}