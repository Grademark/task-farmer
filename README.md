# task-farmer

A simple multi-core task scheduler that works well with promises. Great for doing parallel data processing.

<a target="_blank" href="https://www.data-forge-notebook.com/"><img align="right" src="images/support1.png"></a>

## Complete examples 

For complete runable examples please see [the Task Farmer examples repo](https://github.com/Grademark/task-farmer-examples).

## What is Task Farmer?

I do a lot of work with data. I need to be able to transform and process large amounts of it as quickly as possible. One place this is evident is in my [Grademark API](https://www.npmjs.com/package/grademark) for backtesting and trading. [Simulating a stock trading strategy](http://www.the-data-wrangler.com/backtesting-trading-strategies-with-javascript/) for decades over thousands of companies requires some serious processing power.

I needed a way to divide up and process data to best make of my 16 core desktop PC. That resulted in a closed source code library that I used for many years. Now that I need that library for Grademark I've decided to build a simpler and better API and make it open source. The result of that work is this code repository.

Task Farmer allows you to define a network of tasks and then evaluate the tasks in order. Where possible tasks are run in parallel on seperate CPU cores to make the best use of a multi-core PC.

<a target="_blank" href="https://www.data-forge-notebook.com/"><img align="right" src="images/support2.png"></a>

## Aims of Task Farmer

- To split processing of data over multiple CPU cores on the same PC.
- Be simple to use and inspired by the promises design pattern.
- To work well with JavaScript promises.
- Be able to define graphs of dependent tasks.
- Be able to input data to a task from the master process.
- Be able to input data to a task from another task.

## Why use Task Farmer?

You will only want to use Task Farmer if you have a complex processing job that can be split into *parcels* that can each run in parallel on a separate core.

It will take some work to restructure your code for Task Farmer, so please don't do this unless you are confident that your processing job can be divided up in such a way.

Here are the benefits:
- Your processing job will run significantly faster. Assuming I can divide the job into many independent tasks that can run in parallel on my 16 core PC, I can roughly expect a 16x performance boost. So what previously took 16 minutes, could now take a little as 1 minute. Or 16 hours = 1 hour. You get the point. These are some pretty rough calculations, keep in mind that the actual time you achieve will depend on the nature of the each task - for example the time taken for a task that pulls data from the network will be constrained by the speed of the network.
- Each sub-divided process has access to more memory. If your processing job as a whole is running out of memory, or close to running out of memory, dividing it up into separate tasks means that each task has access to the whole memory space of it's own process.

## How does it work?

Task Farmer allows you to define tasks that are identifiable by name across process boundaries (you have to provide names for tasks).

You must then define the task graph that sets the dependencies between your tasks.

You can then use a *scheduler* to run the tasks. 

Task Farmer comes with two schedulers:
- `ClusterScheduler` - this creates a Node.js cluster of X worker processes to run your tasks. The number of workers (X) is set by you and it can be set to the number of CPUs in your system or a different number, depending on what you want.
- `SingleCoreScheduler` - this is mostly used for debugging. If you have issues running your tasks in parallel, you can try the *single-core* scheduler which will run your tasks inline, one after the other, instead of trying to run them in parallel.

The *cluster* scheduler is the main deal here. When you *run* your task graph Task Farmer submits all the tasks to the scheduler which then runs them in parallel across the worker processes. It continously keeps worker processes busy with one task each until all tasks have completed. 

When new tasks are submitted Task Farmer pushes them to a worker straight way if a worker is available. If no worker is available (all workers are busy) then the task is queued and then, as workers become available they are allocated tasks from the queue until the queue is exhausted, which means all tasks have competed.

Other schedulers might be contributed in the future.

## How do I use it?

Enough theory. Let's use Task Farmer.

### Installation

Install using npm:

    npm install --save task-farmer

Task Farmer can be used from JavaScript or TypeScript. For TS it includes its own type definitions (so no need to install anything else).

### Quick start - single task, single core

Here is a small quick example of how to define and run a task. 

```javascript
const tf = require("task-farmer");

const myTask = tf.Task.register( 
    "my-task",
    async () => {
        console.log("Hello from worker!");
        return "an example result";
    }
);

async function main() {
    const myTaskGraph = myTask.create();

    const scheduler = new tf.SingleCoreScheduler();
    const result = await myTaskGraph.run(scheduler);
    console.log("Task completed with result: " + result);
}

main()
    .catch(err => {
        console.log("An error occurred.");
        console.log(err && err.stack || err);
    });
```

### Quick start - multiple tasks, multiple core

This example shows how to define a task graph with multiple tasks to run on a multi-core cluster.

```javascript
const tf = require("task-farmer");

const taskA = tf.Task.register(
    "TaskA", 
    async () => {
        return 1;
    }
);

const taskB = tf.Task.register(
    "TaskB", 
    async () => {
        return 2;
    }
);

const taskC = tf.Task.register(
    "TaskC",
    async (a, b) => {
        return a + b;
    }
);

function createTask() {
    // TaskA and TaskB provide inputs to TaskC.
    // A and B are run in parallel on separate cores.
    // C cannot be run until both A and C have completed.
    return taskC.create(taskA.create(), taskB.create());
}

async function main(scheduler) {
    const taskGraph = createTask();
    const answer = await taskGraph.run(scheduler);
    console.log("The answer is: " + answer);
}

async function bootCluster() {
    const numWorkers = 2;
    const scheduler = new tf.ClusterScheduler(numWorkers);

    // The scheduler creates the Node.js cluster.
    // Main app entry point is delegated to the scheduler.
    await scheduler.init(() => main(scheduler)); 
}

bootCluster()
    .catch(err => {
        console.log("An error occurred.");
        console.log(err && err.stack || err);
    });
```

Please read on for a breakdown of these examples.

### Single task, single core - breakdown

#### Register a task

To identify tasks between the master and worker processes tasks need to be named. You must provide this name when you register a task as follows.

```javascript
const tf = require("task-farmer");

const task = tf.Task.register(
    "my-task", // This is the name of the task.
    async () => {
        // This function will run on a worker process.
        // This function is asynchronous and can return a promise.
        console.log("Hello from worker!");
        return "an example result";
    }
);
```

#### Create a task graph

Now that we have a task we can create an instance of a task graph:

```javascript
const myTaskGraph = myTask.create();
```
This is hardly a task graph, it's only a single task! But we are only just warming up here. Soon we'll see how to link together multiple tasks.

#### Create a single core scheduler

To run the task graph we need a scheduler. For now let's just create a single core scheduler. A bit later we'll run some tasks on a cluster, but for now let's keep it simple.

```javascript
const scheduler = new tf.SingleCoreScheduler();
```

That's all we need for a single core scheduler. A cluster is more complicated and we'll come back to that soon.

#### Run the task graph

With the task graph create we run it against the scheduler and await the result:

```javascript
const result = await myTaskGraph.run(scheduler);
```

At this moment we only have a single task in our task graph and we are only running it using the single core scheduler. So the task actually runs directly on the same core it was started on. This is good for debugging, but it won't help performance. So now let's create a larger task graph and run it on a cluster.

### Multiple tasks, multiples cores - breakdown

#### Register multiple tasks

As before we must register named tasks. Let's register a bunch of tasks that we can wire together into a task graph.

```javascript
const taskA = tf.Task.register(
    "TaskA", 
    async () => {
        return 1;
    }
);

const taskB = tf.Task.register(
    "TaskB", 
    async () => {
        return 2;
    }
);

const taskC = tf.Task.register(
    "TaskC",
    async (a, b) => {
        return a + b;
    }
);
```

#### Create a task graph

Call the `create` function to instantiate a task. Here we are making TaskC dependent on TaskA and TaskB. That is to say that we expect TaskA and TaskB to do some computation and then provide input to TaskC:

```javascript
const taskGraph = taskC.create(taskA.create(), taskB.create());
```

#### Create a cluster scheduler

In this example we want to run multiple tasks over multiple CPU cores. So we instantiate a `ClusterScheduler`:

```javascript
const numWorkers = 2;
const scheduler = new tf.ClusterScheduler(numWorkers);
```

Note that we specify the number of workers to create. I often set this to the number of CPUs in my PC as follows:

```javascript
const os = require("os");

const numWorkers = os.cpus().length;
const scheduler = new tf.ClusterScheduler(numWorkers);
```

Allocating a worker per CPU means that I can keep all my cores busy and get the maximum amount of throughput in data processing. If you expect a lot of network latency in each task you might event want to scale up the number of workers to two or threes times the number of CPUs you have. 

#### Run the task graph

Now we can run the task graph on our cluster:

```javascript
const result = await taskGraph.run(scheduler);
```

In this example it means that TaskA and TaskB will run in parallel on separate worker processes. They will do their work and then their results will be passed as input to TaskC. TaskC also runs on a worker  process (as do all tasks) and when it completes, its result is returned to the master process where our code is awaiting completion of the entire task graph.

### Mix and match input tasks and direct inputs

A task doesn't need to know where it's input values are coming from. They might be coming from other tasks or they might be direct value passed from the master.

For example, let's look again at TaskC from above:

```javascript
const taskC = tf.Task.register(
    "TaskC",
    async (a, b) => {
        return a + b;
    }
);
```

You can see that TaskC has inputs *a* and *b*, but it doesn't know or care where these values come from. In the earlier example it was TaskA and TaskB that were invoked to provide these input values to TaskC. But TaskC doesn't know about TaskA or TaskB. [Separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns) is a good thing.

This idea makes tasks more reusable and we have some flexibility in how we wire together different tasks into differing arrangements of task graphs.

We can also pass values directly to a task from the master process like this:

```javascript
const taskGraph = taskC.create(1, 2);
```

Here we have created our task graphy by instantiating TaskC with direct input values of 1 and 2. We now run this task and it will be passed these inputs. It will still be run on the worker process of course and these inputs will automatically be copied from master to worker to become inputs to the task function.

The ability to mix and match tasks and direct values as inputs to other tasks gives us flexibility and convenience in how we wire up our task graphs.

### Value serialization

All values (inputs and results) are transmitted between the master and worker processes via Node.js cluster IPC. As such all inputs to tasks and all outputs must be serializable to JSON. That's just a limitation of the system and requirement for how it works.

### Execute multiple tasks in parallel

You can run a collection of tasks in parallel using the function `Task.all` which is very similar in concept to `Promise.all`.

For any array array of tasks you can call `Task.all` to evaluate them all in parallel and aggregate the results of each task into a list of values:

```javascript
const myTasks = [ /* your list of tasks */ ];
const aggregateTask = Task.all(myTasks);
```

Once you have an aggregated a list of tasks you can use it as an input to another task:

```javascript
someDependentTask.create(aggregateTask);
```

In the previous snippet the tasks represented by `aggregateTask` will be evaluated in parallel, the result of which is aggregated into a single list and the list is passed an input to `someDependentTask`.

You can also just run the `aggregateTask` to retreive the list of results:

```javascript
const resultList = await aggregateTask.run(scheduler);
```

### Running tasks from worker processes

What happens when you have a worker process that needs to run tasks? Ideally your master process would identify all tasks and build your task graph, but this isn't always realistic, sometimes you need to delegate to your tasks to figure out what other tasks they depend on - for instance maybe they need to do some expensive computation before they can identify the nested tasks they depend on. 

So, we need to be able to run tasks from both the master and the worker. Fortunately Task Farmer supports this and you don't have to worry about it.

Say you have a task that's going to be evaluated on a worker process. Let's pretend this task can't know ahead of time whether it needs input from TaskA or TaskB:

```javascript
const myTask = tf.Task.register(
    "my-task",
    async (scheduler) => { // Note that the scheduler is always passed as the last parameter to all task functions.

        if (/* some condition*/ ) { // Some conditional we use to decide to run one task or the other.
            return await taskA.create().run(scheduler); // Create and run TaskA.
        }
        else {
            return await taskB.create().run(scheduler); // Create and run TaskB.
        }
    }
)
```

Note that the scheduler is passed as the last parameter to the task function. The task function then conditionaly run either TaskA or TaskC, but we don't know ahead of time which it will be. This task function runs on a worker process, yet it is the master process that coordinates the task queue, so how does this work? Well under the hood the scheduler knows that it is running on a worker and it sends a message to the master to queue any nested tasks.

## Future work

At the moment I'm not planning anything new, but there's much that could be added - for example, a new scheduler that could distribute tasks over multiple PCs (instead of just multiple cores in the same PC).

If you want to contribute and extend this library please fork it, make changes and submit a pull request!