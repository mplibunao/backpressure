import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Context from "effect/Context"
// hide-start
const TaskId = Schema.Number.pipe(Schema.brand("TaskId"))
type TaskId = typeof TaskId.Type

class Task extends Schema.Class<Task>("Task")({
  id: TaskId,
  text: Schema.NonEmptyString,
  done: Schema.Boolean
}) {
  toggle() {
    return new Task({ ...this, done: !this.done })
  }
}

class TaskList extends Schema.Class<TaskList>("TaskList")({
  tasks: Schema.Array(Task)
}) {
  static Json = Schema.fromJsonString(TaskList)
  static empty = new TaskList({ tasks: [] })

  add(text: string): [TaskList, Task] {
    const task = new Task({ id: this.nextId, text, done: false })
    return [new TaskList({ tasks: [...this.tasks, task] }), task]
  }

  toggle(id: TaskId): [TaskList, Option.Option<Task>] {
    const index = this.tasks.findIndex((t) => t.id === id)
    if (index === -1) return [this, Option.none()]
    const updated = this.tasks[index]!.toggle()
    const tasks = [...this.tasks]
    tasks[index] = updated
    return [new TaskList({ tasks }), Option.some(updated)]
  }

  get nextId(): TaskId {
    if (this.tasks.length === 0) return TaskId.make(1)
    return TaskId.make(Math.max(...this.tasks.map((t) => t.id)) + 1)
  }
}

// hide-end

class TaskRepo extends Context.Service<
  TaskRepo,
  {
    readonly list: (all?: boolean) => Effect.Effect<ReadonlyArray<Task>, unknown>
    readonly add: (text: string) => Effect.Effect<Task, unknown>
    readonly toggle: (id: TaskId) => Effect.Effect<Option.Option<Task>, unknown>
    readonly clear: () => Effect.Effect<void, unknown>
  }
>()("TaskRepo") {
  static layer = Layer.effect(
    TaskRepo,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = "tasks.json"

      // Helpers
      const load = Effect.gen(function* () {
        const content = yield* fs.readFileString(path)
        return yield* Schema.decodeEffect(TaskList.Json)(content)
      }).pipe(Effect.orElseSucceed(() => TaskList.empty))

      const save = (list: TaskList) =>
        Effect.gen(function* () {
          const json = yield* Schema.encodeEffect(TaskList.Json)(list)
          yield* fs.writeFileString(path, json)
        })

      // Public API
      const list = Effect.fn("TaskRepo.list")(function* (all?: boolean) {
        const taskList = yield* load
        if (all) return taskList.tasks
        return taskList.tasks.filter((t) => !t.done)
      })

      const add = Effect.fn("TaskRepo.add")(function* (text: string) {
        const list = yield* load
        const [newList, task] = list.add(text)
        yield* save(newList)
        return task
      })

      const toggle = Effect.fn("TaskRepo.toggle")(function* (id: TaskId) {
        const list = yield* load
        const [newList, task] = list.toggle(id)
        yield* save(newList)
        return task
      })

      const clear = Effect.fn("TaskRepo.clear")(function* () {
        yield* save(TaskList.empty)
      })

      return { list, add, toggle, clear }
    })
  )
}
