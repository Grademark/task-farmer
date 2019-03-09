# task-farmer

A simple multi-core task scheduler that works well with promises. Great for doing parallel data processing.

Need to learn data wrangling? See my book [Data Wrangling with JavaScript](http://bit.ly/2t2cJu2) or blog [The Data Wrangler](http://www.the-data-wrangler.com/).

Do prototyping and data analysis in JavaScript with [Data-Forge Notebook](http://www.data-forge-notebook.com/).

## What is Task Farmer?

I do a lot of work with data. I need to be able to transform and process large amounts of it as quickly as possible. One place this is evident is in my [Grademark API](https://www.npmjs.com/package/grademark) for backtesting and trading. [Simulating a stock trading strategy](http://www.the-data-wrangler.com/backtesting-trading-strategies-with-javascript/) for decades over thousands of companies requires some serious processing power.

I needed a way to divide up and process data to best make of my 16 core desktop PC. That resulted in a closed source code library that I used for many years. Now that I need that library for Grademark I've decided to build a simpler and better API and open source. The result of that work is this code repository.

Task Farmer allows you to define a network of tasks and then evaluate the tasks in order. Where possible tasks are run in parallel on seperate CPU cores to make the best use of a multi-core PC.x

## Aims of Task Farmer

- To split processing of data over multiple CPU cores on the same PC.
- Be simple to use and inspired by the promises design pattern.
- To work well with JavaScript promises.
- Be able to define grpahs of dependent tasks.
- Be able to input data to a task from the master process.
- Be able to input data to a task from another task.

## Why use Task Farmer?

You will only want to use Task Farmer if you have a complex processing job that can be split into 'parcels' that can each run in parallel on a separate core.

It will take some work to restructure your code for Task Farmer, so please don't do this unless you confident that your processing job can be divided up in such a way.

What are the benefits:
- Your processing job will run significantly faster. Assuming I can divide the job into many independent tasks that can run in parallel on my 16 core PC, I can roughly expect a 16x performance boost. So what previously took 16 minutes, could now take a little as 1 minute. Or 16 hours = 1 hour. You get the point. This is some pretty rough calculations, keep in mind that the actual time you achieve will depend on the nature of the each task - for example the time taken for a task that pulls data from the network will be constrained by the speed of the network.
- Each sub-divided process has access to more memory. If your processing job as a whole is running out of memory, or close to running out of memory, dividing it up into separate tasks means that each task has access to the whole memory space of it's own process.

## How does it work?

Task Farmer allows you to defined tasks that are identifiable by name across process boundaries (you have to provide names for tasks).

You must then defined the task graph that sets the dependencies between your tasks.

You can then use a *scheduler* to run the tasks. 

Task Farmer comes with two types of scheduler:
- ClusterScheduler - this creates a Node.js cluster of X worker processes to run your tasks. The number of workers (X) is set by you and it can be set to the number of CPUs in your system or a different number, depending on what you want.
- SingleCoreScheduler - this is mostly used for debugging. If you have issues running your tasks in parallel, you can try the *single-core scheduler* which will run your tasks inline, one after the other, instead of trying to run them in parallel.

The *cluster scheduler* is the main deal here. When you *run* your task graph Task Farmer submits all the tasks to the scheduler which then runs them in parallel across the worker processes. It continously keeps workers processes busy with one task each until all tasks have complete. When new tasks are submitted Task Farmer pushes them to a worker straight way if a worker is available. If no worker is available (all workers are busy) then the task is queued and as workers become available they are allocated tasks from the queue until the queue is exhausted, which means all tasks have competed.

More types of schedulers might be contributed in the future.

## How do I use it?

Enough theory. Let's use Task Farmer.

### Installation

Install using npm:

    npm install --save task-farmer

Task Farmer work with JavaScript and TypeScript. For TS it includes its own type definitions (so no need to install anything else).

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

const taskC = Task.register(
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

Please read on for a more thorough understand of this example or skim ahead for more complex examples.

### Single task, single core - breakdown

#### Register a task

To identify tasks between the master and worker processes tasks need to be named. You must provide this name when you register a task as follows.

```javascript
const tf = require("task-farmer");

const task = tf.Task.register( //TODO: might just be better as tf.register.
    "my-task",
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

### Multiple tasks, multi-core - breakdown

#### Register multiple tasks

As before we must register named tasks.

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

const taskC = Task.register(
    "TaskC",
    async (a, b) => {
        return a + b;
    }
);
```

#### Create a task graph

Call the `create` function to instantiate a task. Here we making TaskC dependent on TaskA and TaskB. That is to say that we expect TaskA and TaskB to do some computation and then provide input to TaskC:

```javascript
const taskGraph = taskC.create(taskA.create(), taskB.create());
```

#### Create a cluster scheduler

In this example we want to run multiple tasks over multiple CPU cores. So we create an instance of the `ClusterScheduler`:

```javascript
const numWorkers = 2;
const scheduler = new tf.ClusterScheduler(numWorkers);
```

Not that we can specify the number of workers to create. I often set this to the number of CPUs in my PC as follows:

```javascript
const numWorkers = os.cpus().length;
const scheduler = new tf.ClusterScheduler(numWorkers);
```

Allocating a worker per CPU means that I can keep all my cores busy and get the maximum amount of throughput in data processing. If you expect a lot of network latency in each task you might want to even scale up the number of workers to two or threes times the number of CPUs you have. 

#### Run the task graph

Now we can run the task graph on our cluster:

```javascript
const result = await taskGraph.run(scheduler);
```

In this example it means that TaskA and TaskB will run in parallel on separate worker processes. They will do their work and then their results will be passed as input to TaskC. TaskC also runs on a worker  process (as do all tasks) and when it completes its result is returned to the master process where our code is awaiting completion of the entire task graph.

### Mix and match input tasks and direct inputs

For any task it doesn't have to know where it's input values are coming from. They might be coming from other tasks or they might be direct value passed from the master.

For example, let's look again at TaskC from above:

```javascript
const taskC = Task.register(
    "TaskC",
    async (a, b) => {
        return a + b;
    }
);
```

You can see that TaskC has inputs *a* and *b*, but it doesn't know or care where these values come from. In the earlier example it was TaskA and TaskB that are invoked to provide these input values to TaskC. But TaskC doesn't know about TaskA or TaskB.

This idea makes tasks more reusable and we are flexibly able to wire together different tasks into differing arrangments of task graphs.

We can also pass in values directly and Task Framer also supports this kind of idea as follows:


```javascript
const taskGraph = taskC.create(1, 2);
```

Here we have created our task graphy by instantiating TaskC with inputs 1 and 2. We now run this task and it will be passed these inputs. It will still be run on the worker process of course and these inputs will automatically be copied from master to worker to become inputs to the task function.

The ability to mix and match tasks and direct values as inputs to other tasks gives us flexibility and convenience in how we wire up our task graphs.

### Value serialization

All values (inputs and results) are transmitted between the master and worker processes via Node.js cluster IPC. As such all inputs to tasks and all outputs must be serializable to JSON. That's just a limitation of the system and requirement for how it works.

 ## Future work

 At the moment I'm not planning anything new, but there's much that could be added - for example, a new scheduler that could distribute tasks over multiple PCs (instead of just multiple cores in the same PC).

 If you want to contribute and extend this library please fork it, make changes and submit a pull request!