import { ITask } from "./task";

//
// Interface to a type of scheduler that knows how to schedule tasks.
//
export interface IScheduler {

    //
    // Run a task when possible and resolve promise when completed.
    // Rejects the promise if the task throws an error.
    //
    runTask(inputs: any[], task: ITask<any>): Promise<any>;
}