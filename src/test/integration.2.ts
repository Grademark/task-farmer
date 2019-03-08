//
// This is an example of running tasks on a single core.
//

import * as os from "os";
import { Task, ITask } from "../lib/task";
import { IScheduler } from "../lib/scheduler";
import { SingleCoreScheduler } from "../lib/single-core-scheduler";
import { assert } from "console";

const taskA = Task.register(    // All tasks must be registered globally so they exist in both the master and worker processes.
    "TaskA",                    // Tasks must be named so they can be identified in the work proceses.
    async () => {               // This function implements "Task A".
        console.log("!!!! Task A"); 
        return 1;               // <-- This could be a complex time consuming calculation. Results must be serializable to JSON.
    }
);

const taskB = Task.register(
    "TaskB", 
    async () => {
        console.log("!!!! Task B"); 
        return 2;               // <-- Any of these task functions can be asynchronous and return a promise.
    }
);

const taskC = Task.register(
    "TaskC",
    async (a: number, b: number) => { // Task inputs must be serializable to JSON.
        console.log("!!!! Task C"); 
        return a + b;           // <-- This task is dependent on pre-computed inputs from other tasks.
    }
);

//
// Your function to wire together a task with dependencies.
//
function createTask(): ITask<number> {
    //
    // Your code here decided how to build the task graph.
    // Here we are saying that taskA and taskB are inputs to task C.
    //
    return taskC.create(taskA.create(), taskB.create());
}

//
// Run application code.
//
async function main(scheduler: IScheduler) {
    const task = createTask();
    const answer = await task.run(scheduler);  // Run the task and await completion. Tasks A and B run in parallel on separate workers.
    console.log("The answer: " + answer);
    assert(answer === 3);
}

//
// Bootstrap the cluster.
//
async function bootstrap() {
    const scheduler = new SingleCoreScheduler();
    await main(scheduler);
}

bootstrap()
    .catch(err => console.error(err && err.stack || err));
