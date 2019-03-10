//
// This is an example of running tasks on a Node.js cluster of worker processes.
//

import * as os from "os";
import { Task, ITask } from "../lib/task";
import { IScheduler } from "../lib/scheduler";
import { ClusterScheduler } from "../lib/cluster-scheduler";
import { assert } from "console";

const taskA = Task.register(
    "TaskA",
    async () => {
        return 3;
    }
);

const taskB = Task.register(
    "TaskB", 
    async (scheduler: IScheduler) => {
        const result = await taskA.create().run(scheduler); // This task schedules TaskA from the the worker process.
        return result + 2;
    }
);

//
// Run application code.
//
async function main(scheduler: IScheduler) {
    const task = taskB.create();
    const answer = await task.run(scheduler);
    console.log("The answer: " + answer);
    assert(answer === 5);
}

//s
// Bootstrap the cluster.
//
async function bootstrap() {
    const numWorkers = 1    ;
    const scheduler = new ClusterScheduler(numWorkers, { verbose: true }); // Create a Node.js cluster of X worker processes.
    await scheduler.init(() => main(scheduler)); // Let the scheduler call our main process.
}

bootstrap()
    .catch(err => console.error(err && err.stack || err));
