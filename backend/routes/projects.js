import { Router } from 'express';
import { listProjects, getProject } from '../projects.js';

const router = Router();

router.get('/projects', async (_req, res) => {
  try {
    const projects = await listProjects();
    res.json({ ok: true, projects });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:name', async (req, res) => {
  try {
    const project = await getProject(req.params.name);
    res.json({ ok: true, project });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

export default router;