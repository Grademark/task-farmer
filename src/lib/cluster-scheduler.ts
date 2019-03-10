import * as cluster from "cluster";
import { IScheduler } from "./scheduler";
import { v4 as uuid } from "uuid";
import { ITask, Task, TaskFn } from "./task";

//
// Options to the cluster scheduler.
//
export interface IClusterSchedulerOptions {
    //
    // Enable verbose debug logging.
    //
    verbose?: boolean;

    //
    // Use this to set the maximum task allocations per worker.
    //
    maxAllocations?: number;
}

//
// Records details for a work and when it is busy.
//
export interface IWorkerRecord {
    //
    // The index of the worker, good for debugging.
    //
    workerIndex: number;

    //
    // The unique ID of the worker.
    //
    workerId: string;

    //
    // Records how many tasks a worker is running.
    //
    allocations: number;

    //
    // Records the maximum number of tasks a worker can run.
    //
    maxAllocations: number;

    //
    // The Node.js cluster object that represents the worker.
    //
    worker: cluster.Worker;
}

//
// Maps workers to their details by unique ID>
//
export interface IWorkerMap {
    [index: string]: IWorkerRecord;
}

//
// Records a task that is scheduled to run.
//
export interface ITaskRecord {
    inputs: any[]; //fio: are all these fields needed.

    //
    // The unique ID of the task.
    // Used to track the task on the master process.
    //
    taskId: string;

    //
    // The name of the task.
    // Used to lookup the task in the worker process.
    //
    taskName: string;

    // 
    // Promise to be resolved when the task completes successfully.
    //
    resolve: (result: any) => void;

    //
    // Promise to be rejected if the tasks throws an error.
    //
    reject: (error: any) => void;
}

//
// Lookup table for tasks by unique ID.
//
export interface ITaskMap {
    [index: string]: ITaskRecord;
}

//
// An implementation of a scheduler that creates worker processes for running tasks.
// Uses the Node.js cluster module.
//
export class ClusterScheduler implements IScheduler {

    //
    // Enable debug logging.
    //
    private enableVerboseLogging: boolean;

    //
    // Maximum tasks that can be allocated per worker at any one time.
    //
    private maxAllocations: number;

    //
    // Number of worker processes to create.
    //
    private numWorkers: number;

    //
    // A list of all worker processes created.
    //
    private workers: cluster.Worker[] = [];

    //
    // A lookup table of workers by unique ID.
    //
    private workerMap: IWorkerMap = {};

    //
    // A queue of tasks to be run.
    //
    private taskQueue: ITaskRecord[] = [];

    //
    // Tasks currenlty executing.
    //
    private pendingTasks: ITaskMap = {};

    //
    // Records if I'm master or worker.
    //
    private whoami: string = "unknown";

    constructor(numWorkers: number, options?: IClusterSchedulerOptions) {
        this.numWorkers = numWorkers;
        this.enableVerboseLogging = options && options.verbose || false;
        this.maxAllocations = options && options.maxAllocations || 1;
    }

    //
    // Call this function to initialize the cluster and fork worker processes.
    // Calls user-defined "mainFn" to run in the master process.
    //
    public async init(mainFn: () => Promise<void>): Promise<void> {

        if (cluster.isMaster) {
            this.whoami = "MASTER";

            // Running on the master.
            this.verbose(`Starting ${this.numWorkers} worker processes.`);
        
            for (let workerIndex = 0; workerIndex < this.numWorkers; ++workerIndex) {
                const workerId = uuid();
                const worker = cluster.fork({ 
                    WORKER_ID: workerId,
                    WORKER_INDEX: workerIndex,
                });
                this.trackWorker(workerIndex, workerId, worker, this.maxAllocations);
            }

            await mainFn();
    
            this.shutdownWorkers();
    
            this.verbose("Master done.");
        }
        else {
            this.whoami = `WORKER[${process.env.WORKER_INDEX}]`;

            this.initWorker();

            this.verbose("Worker online.");
        }
    }

    //
    // Run a task when possible and resolve promise when completed.
    // Rejects the promise if the task throws an error.
    //
    public runTask(inputs: any[], task: ITask<any>): Promise<any> {

        if (cluster.isWorker) {
            return this.sendTask(task, inputs);
        }
        else {
            const taskId = task.getTaskId();
            const taskName = task.getTaskDef().getTaskName();
            return this.queueTask(inputs, taskId, taskName);
        }
    }

    //
    // Send a task to the master to be queued.
    //
    private sendTask(task: ITask<any>, inputs: any[]): Promise<void> {
        if (!cluster.isWorker) {
            throw new Error("Expect sendTask to only run on a worker.");
        }

        const taskId = task.getTaskId();
        const taskName = task.getTaskDef().getTaskName();
        this.verbose(`Sending task ${taskName} (${taskId}) to master.`);
        // Track the task so that the promise can be resolved once it's done.
        const taskPromise = new Promise<any>((resolve, reject) => {
            this.pendingTasks[taskId] = {
                inputs,
                taskId,
                taskName,
                resolve,
                reject,
            };
        });
        // Send the task to the master.
        process.send!({
            type: "queue-task",
            inputs,
            taskId,
            taskName,
            workerId: process.env.WORKER_ID,
        });

        return taskPromise;
    }

    //
    // Queue a task on the master.
    //
    private queueTask(inputs: any[], taskId: string, taskName: string): Promise<any> {
        if (!cluster.isMaster) {
            throw new Error("Expect queueTask to only run on the master.");
        }

        this.verbose(`Queuing task ${taskName} (${taskId}) on master.`);
        const taskPromise = new Promise<any>((resolve, reject) => {
            this.taskQueue.push({
                inputs,
                taskId,
                taskName,
                resolve,
                reject,
            });
        });

        this.scheduleTasks(); // Run tasks if workers are currently free.

        return taskPromise;
    }

    //
    // Optional verbose logging.
    //
    private verbose(msg: any) {
        if (this.enableVerboseLogging) {
            console.log(this.whoami + ": " + msg);
        }
    }
    
    //
    // Track a worker process that was created.
    //
    private trackWorker(workerIndex: number, workerId: string, worker: cluster.Worker, maxAllocations: number) {
        this.workers.push(worker);
        this.workerMap[workerId] = {
            workerIndex,
            workerId, 
            allocations: 0,
            maxAllocations,
            worker,
        };

        worker.on("message", msg => {

            if (msg.type === "task-complete") { // Worker notifying master that a task has completed.

                this.workerMap[workerId].allocations -= 1;
                const taskRecord = this.pendingTasks[msg.taskId];
                this.verbose(`Task ${taskRecord.taskName} (${taskRecord.taskId}) has completed.`);

                delete this.pendingTasks[msg.taskId];
                taskRecord.resolve(msg.result); // Resolve the task's promise.

                this.scheduleTasks(); // Worker is now free, schedule more tasks.
            }
            else if (msg.type === "task-error") { // Worker notifying master that a task has thrown an error.
                this.workerMap[workerId].allocations -= 1;
                const taskRecord = this.pendingTasks[msg.taskId];
                this.verbose(`Task ${taskRecord.taskName} (${taskRecord.taskId}) has thrown error:`);
                this.verbose(msg.error);

                delete this.pendingTasks[msg.taskId];
                taskRecord.reject(msg.error); // Reject the task's promise.

                this.scheduleTasks(); // Worker is now free, schedule more tasks.
            }
            else if (msg.type === "queue-task") { // Worker requesting master to queue a task.

                this.workerMap[msg.workerId].maxAllocations += 1; // When a worker requests a task be queued we increase its max allocations by 1 to help avoid deadlocks.

                this.queueTask(msg.inputs, msg.taskId, msg.taskName)
                    .then(result => {
                        worker.send({
                            type: "task-complete",
                            taskId: msg.taskId,
                            result,
                        });
                    })
                    .catch(err => {
                        worker.send({
                            type: "task-error",
                            taskId: msg.taskId,
                            error: err && err.stack || err.toString(),
                        });
                    })
                    .then(() => {
                        this.workerMap[msg.workerId].maxAllocations -= 1;
                    });
            }
            else {
                throw new Error(`Unrecognised message ${msg.type} from worker.`);
            }
        });
    }

    //
    // Code to run in the work process to initalized.
    //
    private initWorker(): void {
        process.on("message",  msg => {
            if (msg.type === "exit") { // Master has instructed the worker to shutdown.
                this.verbose("Exiting worker.");
                process.exit(0); 
            }
            else if (msg.type === "run-task") { // Master has instructed the worker to run a task.

                this.verbose(`Running task ${msg.taskName} (${msg.taskId}) on worker.`);

                const taskDef = Task.lookup(msg.taskName); // Look up the task by name.
                const taskFn = taskDef.getTaskFn();
                taskFn(...msg.inputs, this) // Execute the task's function, passing in direct inputs.
                    .then(result => { // Worker completed sucessfully.

                        this.verbose(`Task ${msg.taskName} (${msg.taskId}) has completed on worker.`);

                        process.send!({ // Tell the master the task has completed.
                            type: "task-complete",
                            taskId: msg.taskId,
                            result,
                            workerId: process.env.WORKER_ID,
                        });
                    })
                    .catch(err => { // Worker has thrown an error.

                        this.verbose(`Task ${msg.taskName} (${msg.taskId}) has errored on worker.`);
                        this.verbose(err && err.stack || err.toString());

                        process.send!({ // Tell the master the task has errored.
                            type: "task-error",
                            taskId: msg.taskId,
                            error: err && err.stack || err.toString(),
                            workerId: process.env.WORKER_ID,
                        });
                    });
            }
            else if (msg.type === "task-complete") { // Master telling process that a task it queued has completed.
                const taskRecord = this.pendingTasks[msg.taskId];
                this.verbose(`Task ${taskRecord.taskName} (${taskRecord.taskId}) has completed.`);

                delete this.pendingTasks[msg.taskId];
                taskRecord.resolve(msg.result); // Resolve the task's promise.
            }
            else if (msg.type === "task-error") { // Master telling process that a task it queued has errorred.
                const taskRecord = this.pendingTasks[msg.taskId];
                this.verbose(`Task ${taskRecord.taskName} (${taskRecord.taskId}) has thrown error:`);
                this.verbose(msg.error);

                delete this.pendingTasks[msg.taskId];
                taskRecord.reject(msg.error); // Reject the task's promise.
           }
            else {
                throw new Error(`Unrecognised message ${msg.type} from master.`);
            }
        });
    }
    
    //
    // Run a task if there is a task to run and there is a worker available to run it.
    //
    private scheduleTask(): boolean {

        if (this.taskQueue.length <= 0) {
            // No tasks to be executed.
            return false;
        }

        const freeWorkers = Object.keys(this.workerMap)
            .filter(workerId => this.workerMap[workerId].allocations < this.workerMap[workerId].maxAllocations)
            .map(workerId => this.workerMap[workerId]);
        if (freeWorkers.length <= 0) {
            // No worker is available.
            this.verbose("Task are ready, no workers are free.");
            return false;
        }

        const nextTask = this.taskQueue.shift()!; // Remove the next task.
        this.pendingTasks[nextTask.taskId] = nextTask;

        const nextFreeWorker = freeWorkers[0]; // Get the next free worker.
        ++nextFreeWorker.allocations;
        this.verbose(`Scheduling task ${nextTask.taskName} (${nextTask.taskId}) on worker.`);

        nextFreeWorker.worker.send({ // Instruct the worker to run the task.
            type: "run-task",
            taskId: nextTask.taskId,
            taskName: nextTask.taskName,
            inputs: nextTask.inputs,
        });

        return true;
    }

    //
    // Schedule one or more tasks to run on worker processes.
    //
    private scheduleTasks() {
        while (true) { // Keep scheduling tasks as long as there are tasks to run and workers free.
            if (!this.scheduleTask()) {
                break; // No more tasks or no more workers. Just have to wait now.
            }
        }
    }

    //
    // Shutdown all the workers.
    //
    private shutdownWorkers(): void {
        for (const worker of this.workers) {
            worker.send({ type: "exit" }); // Instruct workers to shutdown.
        }
    }
    
}