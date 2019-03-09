import { ITask } from "./task";
import { IScheduler } from "./scheduler";

//
// This scheduler just runs tasks inline on the same CPU.
// Good for debugging and test.
//
export class SingleCoreScheduler implements IScheduler {

    //
    // Just runs the task inline on the same CPU..
    //
    public async runTask(inputs: any[], task: ITask<any>): Promise<any> {
        const taskFn = task.getTaskDef().getTaskFn();
        return await taskFn(...inputs);
    }
}