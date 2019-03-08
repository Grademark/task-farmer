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
    create(...inputTasks: any[]): ITask<ResultT>;
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
    public create(...inputTasks: ITask<any>[]): ITask<ResultT> {
        return new Task<ResultT>(inputTasks, this);
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
