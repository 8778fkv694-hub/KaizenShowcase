import PropTypes from 'prop-types';

// 项目类型
export const ProjectType = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  created_at: PropTypes.string,
  updated_at: PropTypes.string
});

// 阶段类型
export const StageType = PropTypes.shape({
  id: PropTypes.number.isRequired,
  project_id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  before_video_path: PropTypes.string,
  after_video_path: PropTypes.string,
  created_at: PropTypes.string
});

// 工序类型
export const ProcessType = PropTypes.shape({
  id: PropTypes.number.isRequired,
  stage_id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  improvement_note: PropTypes.string,
  before_start_time: PropTypes.number.isRequired,
  before_end_time: PropTypes.number.isRequired,
  after_start_time: PropTypes.number.isRequired,
  after_end_time: PropTypes.number.isRequired,
  time_saved: PropTypes.number,
  sort_order: PropTypes.number,
  process_type: PropTypes.oneOf(['normal', 'new_step', 'cancelled'])
});
